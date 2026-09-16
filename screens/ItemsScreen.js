import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Modal, Image, Keyboard, ScrollView, FlatList,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { supabase } from '../lib/supabase';
import { crossAlert } from '../lib/alert';

// Fixed category order for display
const CATEGORY_ORDER = [
  'פירות וירקות', 'בשרי', 'חלבי', 'דגים', 'מאפייה',
  'קפואים', 'שימורים ויבשים', 'משקאות', 'חטיפים וממתקים',
  'ניקיון', 'טיפוח', 'תינוקות', 'ללא קטגוריה',
];

// Transform flat items array into a flat list with section headers mixed in
function buildSections(items) {
  const unchecked = items.filter(i => !i.is_checked);
  const checked = items.filter(i => i.is_checked);

  // Group unchecked items by category
  const grouped = {};
  unchecked.forEach(item => {
    const cat = item.category || 'ללא קטגוריה';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  // Sort within each group by position, then created_at as tiebreaker
  Object.values(grouped).forEach(group => {
    group.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999) || new Date(a.created_at) - new Date(b.created_at));
  });

  // Build flat array ordered by CATEGORY_ORDER, then any remaining categories
  const orderedCategories = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  const flat = [];
  orderedCategories.forEach(category => {
    flat.push({ id: `header-${category}`, type: 'header', category });
    grouped[category].forEach(item => flat.push({ ...item, type: 'item' }));
  });

  // Checked items at the bottom (no dragging needed there)
  if (checked.length > 0) {
    flat.push({ id: '__checked_header__', type: 'header', category: 'Checked ✓', isCheckedHeader: true });
    checked.forEach(item => flat.push({ ...item, type: 'item' }));
  }

  return flat;
}

export default function ItemsScreen({ route, navigation }) {
  const { listId, listColor = '#22c55e' } = route.params;
  const [items, setItems] = useState([]);
  const [listData, setListData] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [myRole, setMyRole] = useState('member');

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editBrand, setEditBrand] = useState('');

  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [members, setMembers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [addingFriend, setAddingFriend] = useState(false);

  const swipeableRefs = useRef({});

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const { data: membership } = await supabase
        .from('list_members')
        .select('role')
        .eq('list_id', listId)
        .eq('user_id', user.id)
        .single();
      if (membership) setMyRole(membership.role);

      fetchItems();
    }
    init();

    const channel = supabase
      .channel(`items-${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` }, () => fetchItems())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={openMembers} style={{ marginRight: 16 }}>
          <Text style={{ fontSize: 22 }}>👥</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  async function fetchItems() {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('list_id', listId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) { crossAlert('Error', error.message); return; }
    setItems(data);
    setListData(buildSections(data));
  }

  // ── Drag to reorder ───────────────────────────────────────

  async function handleDragEnd({ data }) {
    // data is the new flat array after drag
    // Figure out each item's new position and (possibly) new category
    const updates = [];
    let positionCounter = 0;
    let currentCategory = null;

    data.forEach(entry => {
      if (entry.type === 'header') {
        currentCategory = entry.isCheckedHeader ? null : entry.category;
        positionCounter = 0;
      } else if (entry.type === 'item' && currentCategory !== null) {
        // Only update unchecked items — checked items keep their category
        updates.push({ id: entry.id, position: positionCounter, category: currentCategory });
        positionCounter++;
      }
    });

    // Optimistically update local state
    setListData(data);

    // Persist to Supabase
    await Promise.all(
      updates.map(({ id, position, category }) =>
        supabase.from('items').update({ position, category }).eq('id', id)
      )
    );
  }

  // ── Members ───────────────────────────────────────────────

  async function openMembers() {
    Keyboard.dismiss();
    await fetchMembers();
    await fetchFriendsNotOnList();
    setMembersModalVisible(true);
  }

  async function fetchMembers() {
    const { data: rows, error } = await supabase.rpc('get_list_members', { p_list_id: listId });
    if (error || !rows?.length) { setMembers([]); return; }
    const userIds = rows.map(r => r.user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds);
    setMembers(rows.map(r => ({ userId: r.user_id, role: r.role, profile: profiles?.find(p => p.id === r.user_id) ?? { id: r.user_id } })));
  }

  async function fetchFriendsNotOnList() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: friendships } = await supabase.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (!friendships?.length) { setFriends([]); return; }
    const friendIds = friendships.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id);
    const { data: currentMembers } = await supabase.rpc('get_list_members', { p_list_id: listId });
    const memberIds = new Set((currentMembers || []).map(m => m.user_id));
    const eligibleIds = friendIds.filter(id => !memberIds.has(id));
    if (!eligibleIds.length) { setFriends([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', eligibleIds);
    setFriends(profiles || []);
  }

  async function addMemberToList(friendId) {
    setAddingFriend(true);
    const { error } = await supabase.from('list_members').insert({ list_id: listId, user_id: friendId, role: 'member' });
    if (error) crossAlert('Error', error.message);
    else { await fetchMembers(); await fetchFriendsNotOnList(); }
    setAddingFriend(false);
  }

  async function removeMember(userId, name) {
    if (userId === currentUser?.id) return;
    crossAlert('Remove Member', `Remove ${name} from this list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('remove_list_member', { p_list_id: listId, p_user_id: userId });
        if (error) crossAlert('Error', error.message);
        else { await fetchMembers(); await fetchFriendsNotOnList(); }
      }},
    ]);
  }

  async function promoteToManager(userId, name) {
    crossAlert('Promote to Manager', `Make ${name} a manager of this list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Promote', onPress: async () => {
        const { error } = await supabase.rpc('promote_list_member', { p_list_id: listId, p_user_id: userId });
        if (error) crossAlert('Error', error.message);
        else await fetchMembers();
      }},
    ]);
  }

  // ── Items ─────────────────────────────────────────────────

  async function addItem() {
    if (!newItemName.trim()) return;
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Position: send to end of unchecked items
    const uncheckedCount = items.filter(i => !i.is_checked).length;

    const { data: newItem, error } = await supabase
      .from('items')
      .insert({ list_id: listId, name: newItemName.trim(), is_checked: false, added_by: user.id, position: uncheckedCount })
      .select()
      .single();

    if (error) {
      crossAlert('Error', error.message);
    } else {
      setNewItemName('');
      fetchItems();
      if (newItem?.id) {
        supabase.functions.invoke('categorize-item', {
          body: { item_name: newItem.name, item_id: newItem.id },
        }).catch((err) => console.log('Categorize error:', err));
      }
    }
    setAdding(false);
  }

  async function toggleItem(item) {
    const { error } = await supabase.from('items').update({ is_checked: !item.is_checked }).eq('id', item.id);
    if (error) crossAlert('Error', error.message);
    else fetchItems();
  }

  function closeSwipeable(id) { swipeableRefs.current[id]?.close(); }

  function handleEdit(item) {
    closeSwipeable(item.id);
    setEditingItem(item);
    setEditName(item.name);
    setEditQuantity(item.quantity || '');
    setEditBrand(item.brand || '');
    setEditModalVisible(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    const { error } = await supabase.from('items').update({ name: editName.trim(), quantity: editQuantity.trim() || null, brand: editBrand.trim() || null }).eq('id', editingItem.id);
    if (error) crossAlert('Error', error.message);
    else { setEditModalVisible(false); setEditingItem(null); fetchItems(); }
  }

  async function handleDelete(item) {
    closeSwipeable(item.id);
    crossAlert('Delete Item', `Remove "${item.name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('items').delete().eq('id', item.id);
        if (error) crossAlert('Error', error.message);
        else fetchItems();
      }},
    ]);
  }

  // ── Render helpers ────────────────────────────────────────

  function Avatar({ profile, size = 40 }) {
    const initial = (profile?.display_name || profile?.username || '?')[0].toUpperCase();
    if (profile?.avatar_url) return <Image source={{ uri: profile.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: listColor, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontWeight: '700', fontSize: size * 0.38 }}>{initial}</Text>
      </View>
    );
  }

  function renderRow({ item, drag, isActive }) {
    // Section headers are not draggable
    if (item.type === 'header') {
      return (
        <View style={[styles.sectionRow, item.isCheckedHeader && { backgroundColor: '#f0fdf4' }]}>
          <Text style={styles.sectionText}>{item.category}</Text>
        </View>
      );
    }

    const isChecked = item.is_checked;
    return (
      <ScaleDecorator>
        <Swipeable
          ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
          renderLeftActions={() => (
            <TouchableOpacity style={styles.actionDelete} onPress={() => handleDelete(item)}>
              <Text style={styles.actionText}>Delete</Text>
            </TouchableOpacity>
          )}
          renderRightActions={() => (
            <TouchableOpacity style={styles.actionEdit} onPress={() => handleEdit(item)}>
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
          )}
          overshootLeft={false}
          overshootRight={false}
        >
          <TouchableOpacity
            style={[styles.tableRow, isChecked && styles.tableRowChecked, isActive && styles.tableRowDragging]}
            onPress={() => toggleItem(item)}
            activeOpacity={0.7}
          >
            <View style={styles.cellName}>
              <View style={[styles.checkbox, isChecked && { backgroundColor: listColor, borderColor: listColor }]}>
                {isChecked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, isChecked && styles.itemNameChecked]} numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
            </View>
            <View style={styles.cellQty}>
              <Text style={[styles.cellText, isChecked && styles.cellTextChecked]}>{item.quantity || ''}</Text>
            </View>
            <View style={styles.cellBrand}>
              <Text style={[styles.cellText, isChecked && styles.cellTextChecked]}>{item.brand || ''}</Text>
            </View>
            {/* Drag handle — only for unchecked items */}
            {!isChecked && (
              <TouchableOpacity onLongPress={drag} style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.dragIcon}>≡</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </Swipeable>
      </ScaleDecorator>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tableWrapper}>
        {/* Table header */}
        <View style={[styles.tableHeader, { backgroundColor: listColor + '18' }]}>
          <View style={styles.cellName}><Text style={styles.headerText}>Item</Text></View>
          <View style={styles.cellQty}><Text style={styles.headerText}>Qty</Text></View>
          <View style={styles.cellBrand}><Text style={styles.headerText}>Brand</Text></View>
          <View style={styles.cellDrag} />
        </View>

        {Platform.OS === 'web' ? (
          <FlatList
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={({ item, drag, isActive }) => renderRow({ item, drag: () => {}, isActive: false })}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.emptyRow}>
                <Text style={styles.empty}>No items yet. Add your first one below!</Text>
              </View>
            }
          />
        ) : (
          <DraggableFlatList
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            onDragEnd={handleDragEnd}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.emptyRow}>
                <Text style={styles.empty}>No items yet. Add your first one below!</Text>
              </View>
            }
          />
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Add an item..."
            value={newItemName}
            onChangeText={setNewItemName}
            onSubmitEditing={addItem}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <TouchableOpacity style={[styles.addButton, { backgroundColor: listColor }, adding && styles.disabled]} onPress={addItem} disabled={adding}>
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Item</Text>
              <TextInput style={styles.modalInput} placeholder="Item name" value={editName} onChangeText={setEditName} autoFocus />
              <TextInput style={styles.modalInput} placeholder="Quantity (e.g. 2, 500g)" value={editQuantity} onChangeText={setEditQuantity} />
              <TextInput style={styles.modalInput} placeholder="Brand (optional)" value={editBrand} onChangeText={setEditBrand} />
              <Text style={styles.modalHint}>Category will be auto-filled by AI ✨</Text>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: listColor }]} onPress={saveEdit}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Members Modal */}
      <Modal visible={membersModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Members</Text>
            <ScrollView>
              {members.map(m => {
                const name = m.profile?.display_name || m.profile?.username || 'Unknown';
                const sub = m.profile?.username ? `@${m.profile.username}` : '';
                const isMe = m.userId === currentUser?.id;
                return (
                  <View key={m.userId} style={styles.memberRow}>
                    <Avatar profile={m.profile} size={40} />
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{name}{isMe ? ' (you)' : ''}</Text>
                      {sub ? <Text style={styles.memberSub}>{sub}</Text> : null}
                    </View>
                    <View style={[styles.roleBadge, m.role === 'manager' && { backgroundColor: listColor + '22' }]}>
                      <Text style={[styles.roleText, m.role === 'manager' && { color: listColor }]}>{m.role}</Text>
                    </View>
                    {myRole === 'manager' && !isMe && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {m.role === 'member' && (
                          <TouchableOpacity onPress={() => promoteToManager(m.userId, name)} style={styles.promoteBtn}>
                            <Text style={styles.promoteBtnText}>★</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => removeMember(m.userId, name)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}

              {myRole === 'manager' && friends.length > 0 && (
                <>
                  <Text style={styles.addFriendLabel}>Add from friends</Text>
                  {friends.map(f => {
                    const name = f.display_name || f.username || 'Unknown';
                    const sub = f.username ? `@${f.username}` : '';
                    return (
                      <View key={f.id} style={styles.memberRow}>
                        <Avatar profile={f} size={40} />
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName}>{name}</Text>
                          {sub ? <Text style={styles.memberSub}>{sub}</Text> : null}
                        </View>
                        <TouchableOpacity onPress={() => addMemberToList(f.id)} disabled={addingFriend} style={[styles.addFriendBtn, { backgroundColor: listColor }]}>
                          <Text style={styles.addFriendBtnText}>+ Add</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )}

              {myRole === 'manager' && friends.length === 0 && (
                <Text style={styles.noFriendsHint}>All your friends are already on this list, or you have no friends yet.</Text>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setMembersModalVisible(false)}>
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  tableWrapper: { flex: 1, margin: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: Platform.OS === 'web' ? 'visible' : 'hidden', backgroundColor: 'white' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#e5e7eb' },
  headerText: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', minHeight: 52 },
  tableRowChecked: { backgroundColor: '#f0fdf4' },
  tableRowDragging: { backgroundColor: '#f0f9ff', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },

  cellName: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  cellQty: { width: 64, paddingHorizontal: 8, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#e5e7eb', justifyContent: 'center' },
  cellBrand: { width: 90, paddingHorizontal: 8, paddingVertical: 10, justifyContent: 'center' },
  cellDrag: { width: 36 },

  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', marginRight: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  checkmark: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  itemName: { fontSize: 15, color: '#111', flex: 1 },
  itemNameChecked: { color: '#86efac', textDecorationLine: 'line-through' },
  cellText: { fontSize: 14, color: '#374151' },
  cellTextChecked: { color: '#86efac', textDecorationLine: 'line-through' },

  dragHandle: { width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  dragIcon: { fontSize: 18, color: '#d1d5db', fontWeight: '700' },

  sectionRow: { backgroundColor: '#f8fafc', paddingVertical: 6, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  sectionText: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6 },

  emptyRow: { padding: 40, alignItems: 'center' },
  empty: { color: '#9ca3af', fontSize: 15 },

  inputBar: { flexDirection: 'row', padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, marginRight: 10, backgroundColor: '#f9fafb' },
  addButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  disabled: { opacity: 0.6 },
  addButtonText: { color: 'white', fontWeight: '600', fontSize: 15 },

  actionDelete: { backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 75, alignSelf: 'stretch' },
  actionEdit: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', width: 75, alignSelf: 'stretch' },
  actionText: { color: 'white', fontWeight: '600', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  modalHint: { fontSize: 12, color: '#9ca3af', marginBottom: 16, textAlign: 'center' },
  saveButton: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  saveButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  cancel: { textAlign: 'center', color: '#999', fontSize: 16 },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#111' },
  memberSub: { fontSize: 13, color: '#9ca3af', marginTop: 1 },
  roleBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 8 },
  roleText: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' },
  removeBtn: { padding: 6 },
  promoteBtn: { padding: 6, backgroundColor: '#fefce8', borderRadius: 8, paddingHorizontal: 10 },
  promoteBtnText: { color: '#ca8a04', fontWeight: '700', fontSize: 16 },
  removeBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
  addFriendLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  addFriendBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addFriendBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
  noFriendsHint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  closeBtn: { marginTop: 20, backgroundColor: '#f3f4f6', padding: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { fontWeight: '700', color: '#374151', fontSize: 15 },
});
