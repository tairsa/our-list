import 'react-native-url-polyfill/auto';
import { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from './lib/supabase';
import LoginScreen from './screens/LoginScreen';

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

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 20, marginBottom: 24 }}>✅ You're logged in!</Text>
      <TouchableOpacity
        onPress={() => supabase.auth.signOut()}
        style={{ backgroundColor: '#ef4444', padding: 12, borderRadius: 8 }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
