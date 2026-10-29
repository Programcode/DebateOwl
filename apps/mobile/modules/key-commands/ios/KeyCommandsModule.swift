import ExpoModulesCore
import ObjectiveC
import UIKit

// iPad hardware-keyboard shortcuts for src/lib/key-commands.ts. JavaScript sets
// the commands it listens for (an id, the key's input and the title the ⌘ overlay
// shows); a press sends `onKeyCommand` with the id.
//
// The commands hang off UIApplication, near the end of the responder chain, so
// they work wherever the student is: in a text field or not, on a screen or in
// a sheet. UIApplication's `keyCommands` getter is replaced once with one that
// adds ours to whatever it returned before (React Native's own dev shortcuts).

public class KeyCommandsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DebateOwlKeyCommands")

    Events("onKeyCommand")

    OnCreate {
      KeyCommandCenter.shared.onCommand = { [weak self] id in
        self?.sendEvent("onKeyCommand", ["id": id])
      }
      DispatchQueue.main.async { KeyCommandCenter.install() }
    }

    OnDestroy {
      KeyCommandCenter.shared.onCommand = nil
    }

    Function("setCommands") { (commands: [[String: Any]]) in
      DispatchQueue.main.async { KeyCommandCenter.shared.set(commands) }
    }
  }
}

final class KeyCommandCenter {
  static let shared = KeyCommandCenter()
  private static var installed = false

  var onCommand: ((String) -> Void)?
  private(set) var commands: [UIKeyCommand] = []
  private var ids: [String: String] = [:]

  private static func key(_ input: String?, _ flags: UIKeyModifierFlags) -> String {
    "\(input ?? ""):\(flags.rawValue)"
  }

  func set(_ list: [[String: Any]]) {
    var next: [UIKeyCommand] = []
    var nextIds: [String: String] = [:]
    for entry in list {
      guard let id = entry["id"] as? String, let input = entry["input"] as? String, !input.isEmpty else { continue }
      let title = entry["title"] as? String ?? ""
      let command = UIKeyCommand(
        title: title,
        action: #selector(UIApplication.debateOwlKeyCommand(_:)),
        input: input,
        modifierFlags: .command
      )
      command.discoverabilityTitle = title
      command.wantsPriorityOverSystemBehavior = true
      next.append(command)
      nextIds[Self.key(input, .command)] = id
    }
    commands = next
    ids = nextIds
  }

  func handle(_ command: UIKeyCommand) {
    guard let id = ids[Self.key(command.input, command.modifierFlags)] else { return }
    onCommand?(id)
  }

  static func install() {
    guard !installed else { return }
    installed = true
    let cls: AnyClass = UIApplication.self
    let selector = #selector(getter: UIResponder.keyCommands)
    guard let method = class_getInstanceMethod(cls, selector) else { return }
    typealias Getter = @convention(c) (AnyObject, Selector) -> NSArray?
    let original = unsafeBitCast(method_getImplementation(method), to: Getter.self)
    let block: @convention(block) (AnyObject) -> NSArray? = { receiver in
      let earlier = (original(receiver, selector) as? [UIKeyCommand]) ?? []
      return (earlier + KeyCommandCenter.shared.commands) as NSArray
    }
    let replacement = imp_implementationWithBlock(block)
    // UIApplication inherits the getter from UIResponder unless something already overrides it.
    if !class_addMethod(cls, selector, replacement, method_getTypeEncoding(method)) {
      method_setImplementation(method, replacement)
    }
  }
}

extension UIApplication {
  @objc func debateOwlKeyCommand(_ command: UIKeyCommand) {
    KeyCommandCenter.shared.handle(command)
  }
}
