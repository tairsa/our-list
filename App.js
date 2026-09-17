import 'react-native-url-polyfill/auto';
import { useState, useEffect } from 'react';
import { View, ActivityIndicator, Alert, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './lib/supabase';

import LoginScreen from './screens/LoginScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ListsScreen from './screens/ListsScreen';
import ItemsScreen from './screens/ItemsScreen';
import ProfileScreen from './screens/ProfileScreen';
import FriendsScreen from './screens/FriendsScreen';

const Stack = createNativeStackNavigator();

// Pull the token out of ourlist://invite/TOKEN
function extractInviteToken(url) {
  if (!url) return null;
  const match = url.match(/ourlist:\/\/invite\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

async function handleInviteLink(url) {
  const token = extractInviteToken(url);
  if (!token) return;

  // Make sure the user is logged in before redeeming
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase.rpc('redeem_invite_link', { p_token: token });

  if (error) {
    Alert.alert('Error', error.message);
    return;
  }

  switch (data) {
    case 'ok':
      Alert.alert('🎉 Connected!', 'You are now friends!');
      break;
    case 'expired':
      Alert.alert('Link expired', 'This invite link has expired. Ask for a new one.');
      break;
    case 'already_used':
      Alert.alert('Already used', 'This invite link has already been used.');
      break;
    case 'already_friends':
      Alert.alert('Already friends', 'You are already friends with this person.');
      break;
    case 'self':
      Alert.alert('Oops', "You can't add yourself as a friend.");
      break;
    default:
      Alert.alert('Invalid link', 'This invite link is not valid.');
  }
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Handle deep links — both cold start and while app is open
  useEffect(() => {
    // Cold start: app was opened by tapping the link
    Linking.getInitialURL().then(url => {
      if (url) handleInviteLink(url);
    });

    // Warm: app was already open when the link was tapped
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleInviteLink(url);
    });

    return () => sub.remove();
  }, []);

  if (session === undefined) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      </GestureHandlerRootView>
    );
  }

  if (!session) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Lists"
            component={ListsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Items"
            component={ItemsScreen}
            options={({ route }) => ({ title: route.params.listName })}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: 'Profile' }}
          />
          <Stack.Screen
            name="Friends"
            component={FriendsScreen}
            options={{ title: 'Friends' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
