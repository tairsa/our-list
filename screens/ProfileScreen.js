import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ProfileScreen() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Error', error.message);
          // App.js onAuthStateChange handles the redirect automatically
        },
      },
    ]);
  }

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.email}>{user?.email ?? '...'}</Text>
        <Text style={styles.label}>Signed in</Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Our List v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginBottom: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarText: { fontSize: 30, fontWeight: 'bold', color: 'white' },
  email: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  label: { fontSize: 13, color: '#9ca3af' },
  signOutButton: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 12, alignItems: 'center' },
  signOutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
  version: { textAlign: 'center', color: '#d1d5db', fontSize: 12, marginTop: 'auto', paddingBottom: 16 },
});
