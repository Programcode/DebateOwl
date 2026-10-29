import AppIntents
import Foundation
#if canImport(UIKit)
import UIKit
#endif

// Siri, Shortcuts and Spotlight actions for DebateOwl. plugins/with-app-intents.js
// copies this file into the app target during prebuild: Xcode extracts App
// Intents metadata only from the target that compiles the intents, so they
// cannot live in a CocoaPods library.
//
// Every intent opens the app (openAppWhenRun) and hands it a debatelab:// link,
// so routing stays in JavaScript (Expo Router; src/app/+native-intent.tsx lets
// the app's own scheme through). Nothing here reads or writes the student's data.
//
// Titles are the English wording of src/locales/en.json; the plugin checks that
// and writes the Spanish and Hungarian Localizable.strings from the same
// catalogs. The Siri phrases are translated in <lang>.lproj/AppShortcuts.strings.

// MARK: - Opening the app's own links

enum DebateOwlLink {
  static let scheme = "debatelab"

  /// `debatelab://<route>` with the non-empty values as query items. The query
  /// is percent-encoded by URLComponents, which leaves `+` alone; Expo Router
  /// reads `+` as a space, so it is encoded too ("2+2" stays "2+2").
  static func url(_ route: String, query: [(String, String?)] = []) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    components.host = route
    let items = query.compactMap { name, value -> URLQueryItem? in
      guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
      return URLQueryItem(name: name, value: text)
    }
    if !items.isEmpty {
      components.queryItems = items
      components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
    }
    return components.url
  }

  /// Opens a debatelab:// link in this app. With openAppWhenRun the system has
  /// brought the app forward before perform() runs, but on a cold launch it may
  /// still be becoming active, and iOS only opens URLs for an active app, so this
  /// waits (up to three seconds) for it. The open goes through the app
  /// delegate's application(_:open:options:): expo-linking keeps the URL as the
  /// launch URL that Expo Router reads at start, or sends it to a running app.
  @MainActor
  static func open(_ url: URL) async {
    #if canImport(UIKit)
    let application = UIApplication.shared
    if application.applicationState != .active {
      await waitUntilActive(timeout: 3)
    }
    let opened = await application.open(url, options: [:])
    if !opened {
      NSLog("DebateOwl: could not open %@ from an App Intent", url.absoluteString)
    }
    #endif
  }

  #if canImport(UIKit)
  @MainActor
  private static func waitUntilActive(timeout seconds: Double) async {
    let deadline = Date().addingTimeInterval(seconds)
    while UIApplication.shared.applicationState != .active && Date() < deadline {
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
  }
  #endif
}

// MARK: - Intents

struct StartTimerIntent: AppIntent {
  static let title: LocalizedStringResource = "Start timer"
  static let description = IntentDescription("Practice speaking rounds with tournament timing controls.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    if let url = DebateOwlLink.url("timer") { await DebateOwlLink.open(url) }
    return .result()
  }
}

struct AskCoachIntent: AppIntent {
  static let title: LocalizedStringResource = "Ask your coach"
  static let description = IntentDescription("Get coaching on your next move.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Question")
  var question: String?

  @MainActor
  func perform() async throws -> some IntentResult {
    if let url = DebateOwlLink.url("ask", query: [("q", question)]) { await DebateOwlLink.open(url) }
    return .result()
  }
}

struct NewDebateIntent: AppIntent {
  static let title: LocalizedStringResource = "New debate"
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    if let url = DebateOwlLink.url("new-debate") { await DebateOwlLink.open(url) }
    return .result()
  }
}

struct GenerateCaseIntent: AppIntent {
  static let title: LocalizedStringResource = "Case generator"
  static let description = IntentDescription("Build a complete debate case.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Motion")
  var motion: String?

  @MainActor
  func perform() async throws -> some IntentResult {
    if let url = DebateOwlLink.url("generate", query: [("motion", motion)]) { await DebateOwlLink.open(url) }
    return .result()
  }
}

struct OpenLibraryIntent: AppIntent {
  static let title: LocalizedStringResource = "Library"
  static let description = IntentDescription("Manage and toggle sources used for grounded responses.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    if let url = DebateOwlLink.url("library") { await DebateOwlLink.open(url) }
    return .result()
  }
}

struct StartSparringIntent: AppIntent {
  static let title: LocalizedStringResource = "Start sparring"
  static let description = IntentDescription("Run a timed round against AI.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    if let url = DebateOwlLink.url("sparring") { await DebateOwlLink.open(url) }
    return .result()
  }
}

// MARK: - App Shortcuts

// Ready-made shortcuts: Siri phrases and the app's tiles in Shortcuts and
// Spotlight, with no setup by the student. Every phrase names the app
// (\(.applicationName)), as Apple requires; the translations are in
// <lang>.lproj/AppShortcuts.strings, keyed by these English phrases.
struct DebateOwlShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartTimerIntent(),
      phrases: [
        "Start a debate timer in \(.applicationName)",
        "Start the \(.applicationName) timer",
      ],
      shortTitle: "Start timer",
      systemImageName: "timer"
    )
    AppShortcut(
      intent: AskCoachIntent(),
      phrases: [
        "Ask \(.applicationName) a question",
        "Ask \(.applicationName)",
      ],
      shortTitle: "Ask your coach",
      systemImageName: "questionmark.bubble"
    )
    AppShortcut(
      intent: NewDebateIntent(),
      phrases: [
        "Start a new debate in \(.applicationName)",
        "New \(.applicationName) debate",
      ],
      shortTitle: "New debate",
      systemImageName: "plus.bubble"
    )
    AppShortcut(
      intent: GenerateCaseIntent(),
      phrases: [
        "Generate a case in \(.applicationName)",
        "Build a case with \(.applicationName)",
      ],
      shortTitle: "Case generator",
      systemImageName: "sparkles"
    )
    AppShortcut(
      intent: OpenLibraryIntent(),
      phrases: [
        "Open my \(.applicationName) library",
        "Show my sources in \(.applicationName)",
      ],
      shortTitle: "Library",
      systemImageName: "books.vertical"
    )
    AppShortcut(
      intent: StartSparringIntent(),
      phrases: [
        "Start sparring in \(.applicationName)",
        "Spar with \(.applicationName)",
      ],
      shortTitle: "Start sparring",
      systemImageName: "figure.fencing"
    )
  }
}
