import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_URL  = 'https://krishnasbliss.com';
const API_BASE = 'https://krishnasbliss.com/api';

// Custom user-agent so the website can detect it's running inside the app
// and enable the postMessage bridge.
const USER_AGENT = `Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 KrishnasBlissApp/1.0`;

// ── Notification config ───────────────────────────────────────────────────────

// How to display notifications while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

async function getFcmToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[push] Skipping FCM — not a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync();

  if (status !== 'granted') {
    console.log('[push] Notification permission denied');
    return null;
  }

  // getDevicePushTokenAsync returns the raw FCM token (not an Expo token)
  const tokenData = await Notifications.getDevicePushTokenAsync();
  return tokenData.data as string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function registerDeviceToken(jwt: string, fcmToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/account/device-token`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${jwt}`,
      },
      body: JSON.stringify({ fcm_token: fcmToken, platform: Platform.OS }),
    });
  } catch (err) {
    console.warn('[push] registerDeviceToken failed:', err);
  }
}

async function unregisterDeviceToken(jwt: string, fcmToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/account/device-token`, {
      method:  'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${jwt}`,
      },
      body: JSON.stringify({ fcm_token: fcmToken }),
    });
  } catch (err) {
    console.warn('[push] unregisterDeviceToken failed:', err);
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const fcmToken   = useRef<string | null>(null);

  useEffect(() => {
    // Fetch FCM token once on startup
    getFcmToken().then(t => { fcmToken.current = t; });

    // Handle notification tap while app is backgrounded or closed
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url) {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(url)}; true;`
        );
      }
    });

    return () => tapSub.remove();
  }, []);

  // Receive messages from the website running inside the WebView
  const handleMessage = (event: WebViewMessageEvent) => {
    let msg: { type: string; token?: string };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    const token = fcmToken.current;
    if (!token) return;

    if (msg.type === 'USER_LOGIN' && msg.token) {
      registerDeviceToken(msg.token, token);
    } else if (msg.type === 'USER_LOGOUT' && msg.token) {
      unregisterDeviceToken(msg.token, token);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FAF7F2" />
      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        userAgent={USER_AGENT}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        // Allow the WebView to open mailto:/tel: links natively
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F2' },
  webview:   { flex: 1 },
});
