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
  // On login, this field accepts either email or username
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Resolves an email address from the identifier (email or username)
  async function resolveEmail(input) {
    const trimmed = input.trim();

    // If it contains @, it's already an email
    if (trimmed.includes('@')) return trimmed;

    // Otherwise call our SECURITY DEFINER RPC to look up email from auth.users via username
    const { data, error } = await supabase
      .rpc('get_email_by_username', { p_username: trimmed });

    if (error || !data) {
      throw new Error('No account found with that username.');
    }

    return data;
  }

  async function handleSubmit() {
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign up always requires an actual email
        if (!identifier.includes('@')) {
          Alert.alert('Email required', 'Please enter your email address to sign up.');
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: identifier.trim(),
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
        // Login: resolve email from email or username
        const email = await resolveEmail(identifier);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) Alert.alert('Login failed', error.message);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
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
        placeholder={isSignUp ? 'Email' : 'Email or username'}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        keyboardType={isSignUp ? 'email-address' : 'default'}
        autoCorrect={false}
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

      <TouchableOpacity onPress={() => { setIsSignUp(!isSignUp); setIdentifier(''); }}>
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
