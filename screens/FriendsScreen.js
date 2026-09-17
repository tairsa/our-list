import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, Image, Share, ActivityIndicator,
  KeyboardAvoidingView, Platform, Keyboard, Linking,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function FriendsScreen() {
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'requests'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .single();
    setCurrentProfile(profile);

    await Promise.all([fetchFriends(user.id), fetchRequests(user.id)]);
    setLoading(false);
  }

  async function fetchFriends(uid) {
    const userId = uid || currentUser?.id;
    if (!userId) return;

    const { data: friendships, error } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error || !friendships?.length) { setFriends([]); return; }

    const friendIds = friendships.map(f =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', friendIds);

    const combined = friendships.map(f => {
      const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
      return {
        friendshipId: f.id,
        profile: profiles?.find(p => p.id === friendId) ?? { id: friendId },
      };
    });

    setFriends(combined);
  }

  async function fetchRequests(uid) {
    const userId = uid || currentUser?.id;
    if (!userId) return;

    const { data: pending, error } = await supabase
      .from('friendships')
      .select('id, requester_id')
      .eq('addressee_id', userId)
      .eq('status', 'pending');

    if (error || !pending?.length) { setRequests([]); return; }

    const requesterIds = pending.map(r => r.requester_id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', requesterIds);

    const combined = pending.map(r => ({
      friendshipId: r.id,
      profile: profiles?.find(p => p.id === r.requester_id) ?? { id: r.requester_id },
    }));

    setRequests(combined);
  }

  async function searchUsers(query) {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);

    const cleanQuery = query.trim().toLowerCase().replace(/^@/, '');

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%`)
      .neq('id', currentUser.id)
      .limit(10);

    setSearchResults(error ? [] : (data ?? []));
    setSearching(false);
  }

  async function sendRequest(targetId) {
    // Check if friendship already exists in either direction
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .or(
        `and(requester_id.eq.${currentUser.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${currentUser.id})`
      )
      .single();

    if (existing) {
      if (existing.status === 'accepted') {
        Alert.alert('Already friends', 'You are already friends with this person.');
      } else {
        Alert.alert('Request pending', 'A friend request already exists between you two.');
      }
      return;
    }

    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: currentUser.id, addressee_id: targetId });

    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('Request sent!', 'They will see your friend request.');
      setSearchQuery('');
      setSearchResults([]);
      setAddModalVisible(false);
    }
  }

  async function acceptRequest(friendshipId) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (error) Alert.alert('Error', error.message);
    else {
      await Promise.all([fetchFriends(currentUser.id), fetchRequests(currentUser.id)]);
    }
  }

  async function declineRequest(friendshipId) {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) Alert.alert('Error', error.message);
    else await fetchRequests(currentUser.id);
  }

  async function unfriend(friendshipId, friendName) {
    Alert.alert('Remove Friend', `Remove ${friendName} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);
          if (error) Alert.alert('Error', error.message);
          else await fetchFriends(currentUser.id);
        },
      },
    ]);
  }

  async function shareInvite() {
    // Create a token in the database that expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('invite_links')
      .insert({ created_by: currentUser.id, expires_at: expiresAt })
      .select('token')
      .single();

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    const link = `https://ourlist-invite-c852zfp44-tair4.vercel.app/?token=${data.token}`;
    const name = currentProfile?.display_name || currentProfile?.username || 'me';
    const message = `Hey! Join me on Our List 🛒\n${name} is inviting you to be friends.\nTap this link to connect (valid for 30 min):\n${link}`;

    // Try to open WhatsApp directly; fall back to the generic share sheet
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
    } else {
      await Share.share({ message });
    }
  }

  function Avatar({ profile, size = 44 }) {
    const initial = (profile?.display_name || profile?.username || '?')[0].toUpperCase();
    if (profile?.avatar_url) {
      return <Image source={{ uri: profile.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontWeight: '700', fontSize: size * 0.38 }}>{initial}</Text>
      </View>
    );
  }

  function renderFriend({ item }) {
    const name = item.profile?.display_name || item.profile?.username || 'Unknown';
    const sub = item.profile?.username ? `@${item.profile.username}` : '';
    return (
      <View style={styles.friendRow}>
        <Avatar profile={item.profile} />
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{name}</Text>
          {sub ? <Text style={styles.friendSub}>{sub}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => unfriend(item.friendshipId, name)} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderRequest({ item }) {
    const name = item.profile?.display_name || item.profile?.username || 'Unknown';
    const sub = item.profile?.username ? `@${item.profile.username}` : '';
    return (
      <View style={styles.friendRow}>
        <Avatar profile={item.profile} />
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{name}</Text>
          {sub ? <Text style={styles.friendSub}>{sub}</Text> : null}
        </View>
        <View style={styles.requestBtns}>
          <TouchableOpacity onPress={() => acceptRequest(item.friendshipId)} style={styles.acceptBtn}>
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => declineRequest(item.friendshipId)} style={styles.declineBtn}>
            <Text style={styles.declineBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSearchResult({ item }) {
    const name = item.display_name || item.username || 'Unknown';
    const sub = item.username ? `@${item.username}` : '';
    return (
      <View style={styles.friendRow}>
        <Avatar profile={item} />
        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{name}</Text>
          {sub ? <Text style={styles.friendSub}>{sub}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => sendRequest(item.id)} style={styles.addFriendBtn}>
          <Text style={styles.addFriendBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#22c55e" /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            Friends {friends.length > 0 ? `(${friends.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests {requests.length > 0 ? `(${requests.length})` : ''}
          </Text>
          {requests.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{requests.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Friends list */}
      {activeTab === 'friends' && (
        <FlatList
          data={friends}
          keyExtractor={item => item.friendshipId}
          renderItem={renderFriend}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>No friends yet</Text>
              <Text style={styles.emptyHint}>Add friends so you can share lists with them</Text>
            </View>
          }
        />
      )}

      {/* Requests list */}
      {activeTab === 'requests' && (
        <FlatList
          data={requests}
          keyExtractor={item => item.friendshipId}
          renderItem={renderRequest}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📬</Text>
              <Text style={styles.emptyText}>No pending requests</Text>
            </View>
          }
        />
      )}

      {/* Bottom buttons */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
          <Text style={styles.addBtnText}>+ Add Friend</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.whatsappBtn} onPress={shareInvite}>
          <Text style={styles.whatsappBtnText}>📲 Invite via WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {/* Add friend modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Friend</Text>
            <Text style={styles.modalHint}>Search by username or display name</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="@username or name..."
              value={searchQuery}
              onChangeText={text => { setSearchQuery(text); searchUsers(text); }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching && <ActivityIndicator color="#22c55e" style={{ marginVertical: 12 }} />}
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              renderItem={renderSearchResult}
              style={styles.searchResults}
              ListEmptyComponent={
                searchQuery.length > 0 && !searching
                  ? <Text style={styles.noResults}>No users found for "{searchQuery}"</Text>
                  : null
              }
            />
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setAddModalVisible(false); setSearchQuery(''); setSearchResults([]); }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#22c55e' },
  tabText: { fontSize: 15, color: '#9ca3af', fontWeight: '500' },
  tabTextActive: { color: '#22c55e', fontWeight: '700' },
  badge: { backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 100 },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  friendInfo: { flex: 1, marginLeft: 12 },
  friendName: { fontSize: 15, fontWeight: '600', color: '#111' },
  friendSub: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  removeBtnText: { fontSize: 13, color: '#6b7280' },
  requestBtns: { flexDirection: 'row', gap: 8 },
  acceptBtn: { backgroundColor: '#22c55e', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  acceptBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  declineBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  declineBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  addFriendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addFriendBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', marginBottom: 6 },
  emptyHint: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb', gap: 10 },
  addBtn: { backgroundColor: '#22c55e', padding: 14, borderRadius: 12, alignItems: 'center' },
  addBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  whatsappBtn: { backgroundColor: '#dcfce7', padding: 14, borderRadius: 12, alignItems: 'center' },
  whatsappBtnText: { color: '#16a34a', fontWeight: '600', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  modalHint: { fontSize: 13, color: '#9ca3af', marginBottom: 16 },
  searchInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  searchResults: { maxHeight: 300 },
  noResults: { textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingVertical: 16 },
  cancel: { textAlign: 'center', color: '#9ca3af', fontSize: 16, marginTop: 16 },
});
