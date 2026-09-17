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

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>📬</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.message}>
          We sent a password reset link to{'\n'}
          <Text style={styles.emailText}>{email.trim()}</Text>
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Forgot password?</Text>
      <Text style={styles.subtitle}>
        Enter your email and we'll send you a reset link.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        autoFocus
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleReset}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Sending...' : 'Send reset link'}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  backButton: { position: 'absolute', top: 56, left: 24 },
  backText: { color: '#22c55e', fontSize: 16 },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', color: '#666', marginBottom: 32 },
  message: { fontSize: 15, textAlign: 'center', color: '#666', marginBottom: 32, lineHeight: 24 },
  emailText: { fontWeight: '600', color: '#333' },
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
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
