import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';

const COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
];

export default function ListsScreen({ navigation }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLORS[0]);

  const swipeableRefs = useRef({});

  useEffect(() => {
    fetchLists();
  }, []);

  async function fetchLists() {
    const { data, error } = await supabase
      .from('list_members')
      .select(`
        role,
        lists (
          id,
          name,
          color,
          created_by,
          created_at
        )
      `);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const formatted = data.map(entry => ({
        ...entry.lists,
        role: entry.role,
      }));
      setLists(formatted);
    }
    setLoading(false);
  }

  async function createList() {
    if (!newListName.trim()) return;
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('lists')
      .insert({ name: newListName.trim(), created_by: user.id, color: newListColor });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewListName('');
      setNewListColor(COLORS[0]);
      setModalVisible(false);
      fetchLists();
    }
    setCreating(false);
  }

  function closeSwipeable(id) {
    swipeableRefs.current[id]?.close();
  }

  async function handleDelete(item) {
    closeSwipeable(item.id);
    Alert.alert('Delete List', `Are you sure you want to delete "${item.name}" for everyone?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('lists').delete().eq('id', item.id);
          if (error) Alert.alert('Error', error.message);
          else fetchLists();
        },
      },
    ]);
  }

  function handleEdit(item) {
    closeSwipeable(item.id);
    setEditingList(item);
    setEditName(item.name);
    setEditColor(item.color || COLORS[0]);
    setEditModalVisible(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('lists')
      .update({ name: editName.trim(), color: editColor })
      .eq('id', editingList.id);

    if (error) Alert.alert('Error', error.message);
    else {
      setEditModalVisible(false);
      setEditingList(null);
      fetchLists();
    }
  }

  async function handleLeave(item) {
    closeSwipeable(item.id);

    if (item.role === 'manager') {
      const { data, error } = await supabase.rpc('count_list_managers', { p_list_id: item.id });
      if (error) { Alert.alert('Error', error.message); return; }
      if (data === 1) {
        Alert.alert('Last Manager', 'You are the only manager of this list. Delete the list or promote another member first.', [{ text: 'OK' }]);
        return;
      }
    }

    Alert.alert('Leave List', `Are you sure you want to leave "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          const { error } = await supabase.from('list_members').delete().eq('list_id', item.id).eq('user_id', user.id);
          if (error) Alert.alert('Error', error.message);
          else fetchLists();
        },
      },
    ]);
  }

  function ColorPicker({ selected, onSelect }) {
    return (
      <View style={styles.colorPicker}>
        {COLORS.map(color => (
          <TouchableOpacity
            key={color}
            style={[styles.colorDot, { backgroundColor: color }, selected === color && styles.colorDotSelected]}
            onPress={() => onSelect(color)}
          />
        ))}
      </View>
    );
  }

  function renderRightActions(item) {
    return (
      <View style={styles.swipeActions}>
        {item.role === 'manager' && (
          <>
            <TouchableOpacity style={styles.actionDelete} onPress={() => handleDelete(item)}>
              <Text style={styles.actionText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionEdit} onPress={() => handleEdit(item)}>
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={styles.actionLeave} onPress={() => handleLeave(item)}>
          <Text style={styles.actionText}>Leave</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderList({ item }) {
    const color = item.color || COLORS[0];
    return (
      <Swipeable
        ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.listItem}
          onPress={() => navigation.navigate('Items', { listId: item.id, listName: item.name, listColor: color })}
        >
          <View style={[styles.colorBar, { backgroundColor: color }]} />
          <View style={styles.listInfo}>
            <Text style={styles.listName}>{item.name}</Text>
            <Text style={styles.listRole}>{item.role}</Text>
          </View>
          <Text style={styles.listArrow}>›</Text>
        </TouchableOpacity>
      </Swipeable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Our List 🛒</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ New List</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={renderList}
        ListEmptyComponent={<Text style={styles.empty}>No lists yet. Create your first one!</Text>}
      />

      {/* Create modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New List</Text>
              <TextInput
                style={styles.input}
                placeholder="List name (e.g. Weekly Groceries)"
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
              />
              <Text style={styles.colorLabel}>Color</Text>
              <ColorPicker selected={newListColor} onSelect={setNewListColor} />
              <TouchableOpacity
                style={[styles.createButton, { backgroundColor: newListColor }, creating && styles.disabled]}
                onPress={createList}
                disabled={creating}
              >
                <Text style={styles.createButtonText}>{creating ? 'Creating...' : 'Create'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit modal */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit List</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} autoFocus />
              <Text style={styles.colorLabel}>Color</Text>
              <ColorPicker selected={editColor} onSelect={setEditColor} />
              <TouchableOpacity style={[styles.createButton, { backgroundColor: editColor }]} onPress={saveEdit}>
                <Text style={styles.createButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 24, fontWeight: 'bold' },
  addButton: { backgroundColor: '#22c55e', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: 'white', fontWeight: '600' },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', marginHorizontal: 16, marginTop: 12, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, overflow: 'hidden' },
  colorBar: { width: 6, alignSelf: 'stretch' },
  listInfo: { flex: 1, padding: 18 },
  listName: { fontSize: 16, fontWeight: '500' },
  listRole: { fontSize: 12, color: '#999', marginTop: 2, textTransform: 'capitalize' },
  listArrow: { fontSize: 24, color: '#999', paddingRight: 16 },
  empty: { textAlign: 'center', marginTop: 60, color: '#999', fontSize: 16 },
  swipeActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginRight: 16 },
  actionDelete: { backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 75, borderRadius: 12, marginLeft: 8, height: '100%' },
  actionEdit: { backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', width: 75, borderRadius: 12, marginLeft: 8, height: '100%' },
  actionLeave: { backgroundColor: '#f97316', justifyContent: 'center', alignItems: 'center', width: 75, borderRadius: 12, marginLeft: 8, height: '100%' },
  actionText: { color: 'white', fontWeight: '600', fontSize: 13 },
  colorLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 10 },
  colorPicker: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  createButton: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  disabled: { opacity: 0.6 },
  createButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  cancel: { textAlign: 'center', color: '#999', fontSize: 16 },
});
