# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# QR scanning (tauri-plugin-barcode-scanner): ML Kit creates its components by
# reflection, from names in the manifest. R8 removed their constructors in
# release builds ("NoSuchMethodException: ...BarcodeRegistrar.<init>"), ML Kit
# never started, and opening the scanner crashed the app. Debug builds are not
# minified, which is why they scanned fine.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_common.** { *; }
-keep class com.google.android.gms.internal.mlkit_common.** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
-keep class androidx.camera.** { *; }
-keep class app.tauri.barcodescanner.** { *; }
# Registered by Rust by class name; @Command methods and args are reflected.
-keep class to.kryo.mobile.MobilePlugin { *; }
-keep class to.kryo.mobile.MobileArgs { *; }
-keep class to.kryo.mobile.MobileNotificationWorker { *; }
# WorkManager/Room construct their database and startup components by name.
# AGP's optimized release build otherwise strips WorkDatabase_Impl's ctor.
-keep class androidx.work.** { *; }
-keep class androidx.room.** { *; }
-keep class androidx.sqlite.** { *; }
-keep class androidx.startup.** { *; }
