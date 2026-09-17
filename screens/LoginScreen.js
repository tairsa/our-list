import { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen({ navigation }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [identifier, setIdentifier] = useState(''); // login: email or username
  const [loading, setLoading] = useState(false);

  // --- Helpers ---

  function validateUsername(u) {
    return /^[a-z0-9_]{3,20}$/.test(u);
  }

  async function isUsernameTaken(u) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', u)
      .single();
    return !!data;
  }

  // For login: if input has no @, treat as username and look up the email
  async function resolveEmail(input) {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;

    const { data, error } = await supabase
      .rpc('get_email_by_username', { p_username: trimmed });

    if (error || !data) throw new Error('No account found with that username.');
    return data;
  }

  // --- Handlers ---

  async function handleSignUp() {
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedEmail || !trimmedUsername || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!validateUsername(trimmedUsername)) {
      Alert.alert(
        'Invalid username',
        'Username must be 3–20 characters and only contain letters, numbers, or underscores.'
      );
      return;
    }

    // Check availability before hitting the server
    const taken = await isUsernameTaken(trimmedUsername);
    if (taken) {
      Alert.alert('Username taken', 'That username is already in use. Please choose another.');
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: { username: trimmedUsername }, // picked up by the handle_new_user trigger
      },
    });

    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      Alert.alert(
        'Check your email 📬',
        'We sent you a confirmation link. Please verify your email before logging in.'
      );
    }
  }

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email or username and password.');
      return;
    }

    const resolvedEmail = await resolveEmail(identifier);
    const { error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });
    if (error) Alert.alert('Login failed', error.message);
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      if (isSignUp) {
        await handleSignUp();
      } else {
        await handleLogin();
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  }

  function switchMode() {
    setIsSignUp(!isSignUp);
    setEmail('');
    setUsername('');
    setIdentifier('');
    setPassword('');
  }

  // --- UI ---

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Our List 🛒</Text>
        <Text style={styles.subtitle}>{isSignUp ? 'Create an account' : 'Welcome back'}</Text>

        {isSignUp ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Username (e.g. tair_123)"
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Email or username"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

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

        {!isSignUp && (
          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotContainer}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={switchMode}>
          <Text style={styles.toggle}>
            {isSignUp
              ? 'Already have an account? Login'
              : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 32 },
  input: {
    backgroundColor: '#fff',
    color: '#000',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  forgotContainer: { alignItems: 'center', marginBottom: 16 },
  forgotText: { color: '#888', fontSize: 14 },
  toggle: { textAlign: 'center', color: '#22c55e', fontSize: 14, marginTop: 4 },
});
