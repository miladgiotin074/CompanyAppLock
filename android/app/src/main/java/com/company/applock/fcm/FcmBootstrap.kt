package com.company.applock.fcm

import android.content.Context
import com.company.applock.core.Constants
import com.company.applock.core.Prefs
import com.company.applock.sync.SyncEngine
import com.google.firebase.messaging.FirebaseMessaging

/** Subscribes to the broadcast topic and keeps the FCM token registered. */
object FcmBootstrap {
    fun ensureTopicAndToken(ctx: Context) {
        runCatching {
            FirebaseMessaging.getInstance().subscribeToTopic(Constants.FCM_TOPIC)
        }
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                val prefs = Prefs.get(ctx)
                if (prefs.fcmToken != token) {
                    prefs.fcmToken = token
                    SyncEngine.get(ctx).enqueueRegister()
                }
            }
        }
    }
}
