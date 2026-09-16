import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';

export default function ItemsScreen({ route }) {
  const { listId, listColor = '#22c55e' } = route.params;
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editBrand, setEditBrand] = useState('');

  const swipeableRefs = useRef({});

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setItems(data);
    }
  }

  async function addItem() {
    if (!newItemName.trim()) return;
    setAdding(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('items')
      .insert({ list_id: listId, name: newItemName.trim(), is_checked: false, added_by: user.id });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewItemName('');
      fetchItems();
    }
    setAdding(false);
  }

  async function toggleItem(item) {
    const { error } = await supabase
      .from('items')
      .update({ is_checked: !item.is_checked })
      .eq('id', item.id);

    if (error) Alert.alert('Error', error.message);
    else fetchItems();
  }

  function closeSwipeable(id) {
    swipeableRefs.current[id]?.close();
  }

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
    const { error } = await supabase
      .from('items')
      .update({
        name: editName.trim(),
        quantity: editQuantity.trim() || null,
        brand: editBrand.trim() || null,
      })
      .eq('id', editingItem.id);

    if (error) Alert.alert('Error', error.message);
    else {
      setEditModalVisible(false);
      setEditingItem(null);
      fetchItems();
    }
  }

  async function handleDelete(item) {
    closeSwipeable(item.id);
    Alert.alert('Delete Item', `Remove "${item.name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('items').delete().eq('id', item.id);
          if (error) Alert.alert('Error', error.message);
          else fetchItems();
        },
      },
    ]);
  }

  function renderLeftActions(item) {
    return (
      <TouchableOpacity style={styles.actionDelete} onPress={() => handleDelete(item)}>
        <Text style={styles.actionText}>Delete</Text>
      </TouchableOpacity>
    );
  }

  function renderRightActions(item) {
    return (
      <TouchableOpacity style={styles.actionEdit} onPress={() => handleEdit(item)}>
        <Text style={styles.actionText}>Edit</Text>
      </TouchableOpacity>
    );
  }

  function renderItem({ item }) {
    const isChecked = item.is_checked;
    return (
      <Swipeable
        ref={(ref) => { swipeableRefs.current[item.id] = ref; }}
        renderLeftActions={() => renderLeftActions(item)}
        renderRightActions={() => renderRightActions(item)}
        overshootLeft={false}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[styles.tableRow, isChecked && styles.tableRowChecked]}
          onPress={() => toggleItem(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cellName}>
            <View style={[styles.checkbox, isChecked && { backgroundColor: listColor, borderColor: listColor }]}>
              {isChecked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.itemName, isChecked && styles.itemNameChecked]} numberOfLines={2}>
              {item.name}
            </Text>
          </View>
          <View style={styles.cellQty}>
            <Text style={[styles.cellText, isChecked && styles.cellTextChecked]}>
              {item.quantity || ''}
            </Text>
          </View>
          <View style={styles.cellBrand}>
            <Text style={[styles.cellText, isChecked && styles.cellTextChecked]}>
              {item.brand || ''}
            </Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  }

  const unchecked = items.filter(i => !i.is_checked);
  const checked = items.filter(i => i.is_checked);
  const listData = [
    ...unchecked,
    ...(checked.length > 0 ? [{ id: '__divider__', isDivider: true }] : []),
    ...checked,
  ];

  function renderRow({ item }) {
    if (item.isDivider) {
      return (
        <View style={styles.sectionRow}>
          <Text style={styles.sectionText}>Checked</Text>
        </View>
      );
    }
    return renderItem({ item });
  }

  return (
    <View style={styles.container}>
      <View style={styles.tableWrapper}>
        {/* Column headers */}
        <View style={[styles.tableHeader, { backgroundColor: listColor + '18' }]}>
          <View style={styles.cellName}>
            <Text style={styles.headerText}>Item</Text>
          </View>
          <View style={styles.cellQty}>
            <Text style={styles.headerText}>Qty</Text>
          </View>
          <View style={styles.cellBrand}>
            <Text style={styles.headerText}>Brand</Text>
          </View>
        </View>

        {/* Rows */}
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyRow}>
              <Text style={styles.empty}>No items yet. Add your first one below!</Text>
            </View>
          }
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
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
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: listColor }, adding && styles.disabled]}
            onPress={addItem}
            disabled={adding}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  tableWrapper: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    minHeight: 52,
  },
  tableRowChecked: { backgroundColor: '#f0fdf4' },

  cellName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  cellQty: {
    width: 64,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    justifyContent: 'center',
  },
  cellBrand: {
    width: 90,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'center',
  },

  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', marginRight: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  checkboxChecked: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  itemName: { fontSize: 15, color: '#111', flex: 1 },
  itemNameChecked: { color: '#86efac', textDecorationLine: 'line-through' },
  cellText: { fontSize: 14, color: '#374151' },
  cellTextChecked: { color: '#86efac', textDecorationLine: 'line-through' },

  sectionRow: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionText: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6 },

  emptyRow: { padding: 40, alignItems: 'center' },
  empty: { color: '#9ca3af', fontSize: 15 },

  inputBar: { flexDirection: 'row', padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, marginRight: 10, backgroundColor: '#f9fafb' },
  addButton: { backgroundColor: '#22c55e', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
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
  saveButton: { backgroundColor: '#22c55e', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  saveButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  cancel: { textAlign: 'center', color: '#999', fontSize: 16 },
});
