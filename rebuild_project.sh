#!/bin/bash

# Make sure AppDelegate, ContentView and VideoPreviewManager are recognized
touch voodoovideo/AppDelegate.swift
touch voodoovideo/ContentView.swift
touch voodoovideo/VideoPreviewManager.swift
touch voodoovideo/Main.swift

# Remove any Main.storyboard reference and update deployment target
sed -i '' '/INFOPLIST_KEY_NSMainStoryboardFile/d' voodoovideo.xcodeproj/project.pbxproj
sed -i '' 's/MACOSX_DEPLOYMENT_TARGET = 15.2;/MACOSX_DEPLOYMENT_TARGET = 12.0;/g' voodoovideo.xcodeproj/project.pbxproj

# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/voodoovideo-*

# Clean the project
xcodebuild clean -project voodoovideo.xcodeproj -scheme voodoovideo

# Try to build
xcodebuild -project voodoovideo.xcodeproj -scheme voodoovideo -configuration Debug

echo "Rebuild completed. Please open the project in Xcode and run." 