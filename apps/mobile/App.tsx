import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';

// Keep the native splash visible while we set up
SplashScreen.preventAutoHideAsync();

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_URL  = 'https://krishnasbliss.com';
const API_BASE = 'https://krishnasbliss.com/api';
const CREAM    = '#FAF7F2';

// Tells the website it's running inside the app so the postMessage bridge fires
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Mobile Safari/537.36 KrishnasBlissApp/1.0';

// ── Notification config ───────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

async function getFcmToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  const tokenData = await Notifications.getDevicePushTokenAsync();
  return tokenData.data as string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function registerDeviceToken(jwt: string, fcmToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/account/device-token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body:    JSON.stringify({ fcm_token: fcmToken, platform: Platform.OS }),
    });
  } catch { /* best-effort */ }
}

async function unregisterDeviceToken(jwt: string, fcmToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/account/device-token`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body:    JSON.stringify({ fcm_token: fcmToken }),
    });
  } catch { /* best-effort */ }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const fcmToken   = useRef<string | null>(null);

  // ── Splash animation state ─────────────────────────────────────────────────
  // scale: logo starts slightly small and grows to full — "zooming in"
  const scale   = useRef(new Animated.Value(0.82)).current;
  // opacity of the entire splash overlay — fades out to reveal the WebView
  const opacity = useRef(new Animated.Value(1)).current;
  const [splashDone, setSplashDone] = useState(false);

  const runSplashAnimation = useCallback(async () => {
    // Hide the static Expo splash — our animated overlay takes over seamlessly
    await SplashScreen.hideAsync();

    Animated.sequence([
      // Phase 1: Smooth zoom in — logo glides from 82% → 100%, decelerating
      // to rest. Easing.out(cubic) starts fast and slows gracefully — no bounce.
      Animated.timing(scale, {
        toValue:         1.0,
        duration:        1100,
        easing:          Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Phase 2: Hold at full size so the logo has a moment to breathe
      Animated.delay(900),
      // Phase 3: Elegant fade out to reveal the WebView
      Animated.timing(opacity, {
        toValue:         0,
        duration:        550,
        easing:          Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setSplashDone(true));
  }, [scale, opacity]);

  useEffect(() => {
    // Get FCM token and run animation in parallel
    getFcmToken().then(t => { fcmToken.current = t; });
    runSplashAnimation();

    // Handle notification tap (app backgrounded or closed)
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url) {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(url)}; true;`
        );
      }
    });

    return () => tapSub.remove();
  }, [runSplashAnimation]);

  // Receive messages from the website (login / logout bridge)
  const handleMessage = (event: WebViewMessageEvent) => {
    let msg: { type: string; token?: string };
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }

    const token = fcmToken.current;
    if (!token) return;

    if (msg.type === 'USER_LOGIN' && msg.token)  registerDeviceToken(msg.token, token);
    if (msg.type === 'USER_LOGOUT' && msg.token) unregisterDeviceToken(msg.token, token);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" backgroundColor={CREAM} />

      {/* WebView — loads in background; visible once splash fades */}
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
        setSupportMultipleWindows={false}
      />

      {/* Animated splash overlay — sits on top until animation completes */}
      {!splashDone && (
        <Animated.View style={[styles.splash, { opacity }]} pointerEvents="none">
          <Animated.Image
            source={require('./assets/splash.png')}
            style={[styles.splashLogo, { transform: [{ scale }] }]}
            resizeMode="contain"
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CREAM,
    // Push content below the Android status bar so the website header isn't hidden
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  webview: {
    flex: 1,
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CREAM,
    alignItems:      'center',
    justifyContent:  'center',
  },
  splashLogo: {
    width:  '72%',
    height: '72%',
  },
});
