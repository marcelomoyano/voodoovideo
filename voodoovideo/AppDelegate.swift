//
//  AppDelegate.swift
//  voodoovideo
//
//  Created by Marcelo Moyano on 5/14/25.
//

#if canImport(Cocoa)
import Cocoa
#endif
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {

    var window: NSWindow!
    var contentView: ContentView!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        // Create the SwiftUI view that provides the window contents.
        contentView = ContentView()

        // Create the window and set the content view.
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1000, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.center()
        window.setFrameAutosaveName("Main Window")
        window.contentView = NSHostingView(rootView: contentView)
        window.makeKeyAndOrderFront(nil)
        window.title = "Voodoo Pro"
        
        // Configure window appearance
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        
        // Remove separator line
        if #available(macOS 11.0, *) {
            window.titlebarSeparatorStyle = .none
        }
        
        // Set minimum window size
        window.minSize = NSSize(width: 800, height: 500)
    }

    func applicationWillTerminate(_ aNotification: Notification) {
        // Insert code here to tear down your application
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        return true
    }
}

