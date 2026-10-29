import ExpoModulesCore
import UIKit

// Handoff for src/lib/handoff.ts. JavaScript says which screen is open (a title,
// the debateowl.com page that matches it and the app route); this advertises it
// as the current NSUserActivity, so a Mac signed in to the same Apple Account
// offers to continue in Safari, and an iPad with DebateOwl continues in the app.
//
// App to web needs no entitlement: the activity carries webpageURL. App to app
// needs the activity type in Info.plist's NSUserActivityTypes. Web to app (Safari
// on a Mac handing debateowl.com to the phone) would need the Associated Domains
// entitlement `activitycontinuation:debateowl.com`; it is not set up.
//
// The activity is made current with becomeCurrent() and kept here, not attached
// to a view controller's userActivity: UIKit empties a responder-managed
// activity's userInfo before it asks the responder to refill it, which would
// drop the route.

public class HandoffModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DebateOwlHandoff")

    // Another device handed a screen over; JavaScript takes it with takeContinuedPath.
    Events("onContinue")

    OnCreate {
      HandoffCenter.shared.onContinue = { [weak self] in
        self?.sendEvent("onContinue", [:])
      }
    }

    OnDestroy {
      HandoffCenter.shared.onContinue = nil
    }

    Function("setActivity") { (activity: [String: Any]) in
      DispatchQueue.main.async { HandoffCenter.shared.set(activity) }
    }

    Function("clearActivity") {
      DispatchQueue.main.async { HandoffCenter.shared.clear() }
    }

    // The route (or, failing that, the web address) another device handed over,
    // once. Kept until asked, so a handover that launched the app is not lost
    // while JavaScript starts.
    Function("takeContinuedPath") { () -> String? in
      HandoffCenter.shared.takePending()
    }
  }
}

/// Receives activities handed over from another device. Expo's linking
/// subscriber only takes web-browsing activities, so ours would otherwise
/// open the app on its first screen.
public class HandoffAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([any UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return HandoffCenter.shared.receive(userActivity)
  }
}

// Unchecked: the activity is touched on the main thread only, `pending` behind
// the lock, and `onContinue` is set once when the module is created.
final class HandoffCenter: @unchecked Sendable {
  static let shared = HandoffCenter()
  /// Also listed in Info.plist's NSUserActivityTypes (app.config.ts).
  static let activityType = "com.pistack.debateowl.browsing"
  private static let hosts: Set<String> = ["debateowl.com", "www.debateowl.com"]

  var onContinue: (() -> Void)?

  // Main thread only.
  private var current: NSUserActivity?
  private var activation: NSObjectProtocol?

  // Written on the main thread, read from JavaScript's.
  private let lock = NSLock()
  private var pending: String?

  /// Makes `entry` the current activity. Anything but our type with an https
  /// debateowl.com address clears it instead.
  func set(_ entry: [String: Any]) {
    guard entry["type"] as? String == Self.activityType,
          let address = entry["webpageURL"] as? String,
          let url = URL(string: address),
          url.scheme == "https",
          let host = url.host?.lowercased(),
          Self.hosts.contains(host)
    else {
      clear()
      return
    }
    let title = entry["title"] as? String
    let path = entry["appPath"] as? String

    // The same screen again (a re-render, a language change): keep the activity.
    if let current, current.webpageURL == url, current.userInfo?["path"] as? String == path {
      current.title = title
      current.becomeCurrent()
      return
    }

    let activity = NSUserActivity(activityType: Self.activityType)
    activity.title = title
    activity.webpageURL = url
    if let path {
      activity.addUserInfoEntries(from: ["path": path])
    }
    activity.isEligibleForHandoff = true
    // Spotlight and Siri suggestions belong to their own work.
    activity.isEligibleForSearch = false
    activity.isEligibleForPublicIndexing = false
    activity.isEligibleForPrediction = false

    current?.invalidate()
    current = activity
    activity.becomeCurrent()
    observeActivation()
  }

  func clear() {
    current?.invalidate()
    current = nil
  }

  /// Advertises the activity again when the app returns to the foreground.
  private func observeActivation() {
    guard activation == nil else { return }
    activation = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.current?.becomeCurrent()
    }
  }

  /// Keeps a handed-over screen for JavaScript; false for activities that are not ours.
  func receive(_ activity: NSUserActivity) -> Bool {
    guard activity.activityType == Self.activityType else { return false }
    let value = (activity.userInfo?["path"] as? String) ?? activity.webpageURL?.absoluteString
    guard let value else { return true }
    lock.lock()
    pending = value
    lock.unlock()
    onContinue?()
    return true
  }

  func takePending() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let value = pending
    pending = nil
    return value
  }
}
