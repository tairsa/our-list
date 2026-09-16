import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Check your email 📬',
          'We sent you a confirmation link. Please verify your email before logging in.'
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Error', error.message);
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>Our List 🛒</Text>
      <Text style={styles.subtitle}>{isSignUp ? 'Create an account' : 'Welcome back'}</Text>

      {isSignUp && (
        <TextInput
          style={styles.input}
          placeholder="Full name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Login'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
        <Text style={styles.toggle}>
          {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#22c55e', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  toggle: { textAlign: 'center', color: '#22c55e', fontSize: 14 },
});
