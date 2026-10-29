# Keep Room entities/DAOs metadata.
-keep class com.company.applock.sync.db.** { *; }

# Firebase messaging service is referenced from the manifest.
-keep class com.company.applock.fcm.** { *; }

# Keep our Service/Receiver/Worker entry points (referenced by the framework).
-keep class com.company.applock.lockengine.LockService { *; }
-keep class com.company.applock.receivers.** { *; }
-keep class com.company.applock.watchdog.*Worker { *; }
-keep class com.company.applock.sync.SyncWorker { *; }
