import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Image, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { crossAlert } from '../lib/alert';

export default function ProfileScreen() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
      setDisplayName(data.display_name || '');
      setUsername(data.username || '');
    }
  }

  function pickImage() {
    crossAlert('Change Photo', 'Choose a source', [
      { text: 'Camera', onPress: openCamera },
      { text: 'Photo Library', onPress: openLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function openLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      crossAlert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) await uploadAvatar(result.assets[0].uri);
  }

  async function openCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      crossAlert('Permission needed', 'Please allow access to your camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) await uploadAvatar(result.assets[0].uri);
  }

  async function uploadAvatar(uri) {
    setUploading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: data.publicUrl, updated_at: new Date().toISOString() });

      if (updateError) throw updateError;

      setProfile(prev => ({ ...prev, avatar_url: data.publicUrl }));
    } catch (err) {
      crossAlert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    // Validate username
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername && !/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      crossAlert(
        'Invalid username',
        'Username must be 3–20 characters and can only contain letters, numbers and underscores (_).'
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: displayName.trim() || null,
        username: trimmedUsername || null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      // Supabase returns 23505 for unique constraint violations
      if (error.code === '23505') {
        crossAlert('Username taken', 'That username is already in use. Please choose another one.');
      } else {
        crossAlert('Error', error.message);
      }
    } else {
      setUsername(trimmedUsername);
      crossAlert('Saved!', 'Your profile has been updated.');
    }
    setSaving(false);
  }

  async function handleSignOut() {
    crossAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) crossAlert('Error', error.message);
        },
      },
    ]);
  }

  const initial = (profile?.display_name || user?.email)?.[0]?.toUpperCase() ?? '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <TouchableOpacity onPress={pickImage} style={styles.avatarWrapper}>
          {uploading ? (
            <View style={styles.avatar}>
              <ActivityIndicator color="white" size="large" />
            </View>
          ) : profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.cameraBtn}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.email}>{user?.email ?? '...'}</Text>

        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="How others see you (e.g. Tair)"
          placeholderTextColor="#9ca3af"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={30}
        />

        <Text style={styles.label}>Username</Text>
        <View style={styles.usernameRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.usernameInput}
            placeholder="your_username"
            placeholderTextColor="#9ca3af"
            value={username}
            onChangeText={text => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Text style={styles.hint}>3–20 characters, letters, numbers and _ only. Friends can find you by this.</Text>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.disabled]}
          onPress={saveProfile}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Our List v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 24, paddingBottom: 48 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginBottom: 20 },
  avatarWrapper: { marginBottom: 16, position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarInitial: { fontSize: 36, fontWeight: 'bold', color: 'white' },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: 'white', borderRadius: 14, width: 28, height: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  cameraIcon: { fontSize: 14 },
  email: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  label: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  nameInput: { width: '100%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 16, color: '#111' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginBottom: 6, overflow: 'hidden' },
  atSign: { paddingLeft: 12, paddingRight: 4, fontSize: 15, color: '#6b7280', fontWeight: '600' },
  usernameInput: { flex: 1, padding: 12, paddingLeft: 0, fontSize: 15, color: '#111' },
  hint: { alignSelf: 'flex-start', fontSize: 12, color: '#9ca3af', marginBottom: 20 },
  saveBtn: { backgroundColor: '#22c55e', paddingVertical: 13, paddingHorizontal: 32, borderRadius: 10, width: '100%', alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
  signOutBtn: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 12, alignItems: 'center' },
  signOutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
  version: { textAlign: 'center', color: '#d1d5db', fontSize: 12, marginTop: 24 },
});
