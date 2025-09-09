import React, { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useHealth } from "../systems/health/HealthContext";

export const DeathModal: React.FC<{ onRestart?: () => void; onMainMenu?: () => void; }> = ({ onRestart, onMainMenu }) => {
  const { isDead } = useHealth();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (isDead) {
      // Add 2-second delay before showing the modal
      const timer = setTimeout(() => {
        setShowModal(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      // Reset modal state when player is alive
      setShowModal(false);
    }
  }, [isDead]);

  return (
    <Modal transparent visible={showModal} animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>You Died</Text>
          <View style={{ height: 12 }} />
          <Pressable style={styles.btn} onPress={onRestart}>
            <Text style={styles.btnTxt}>Restart</Text>
          </Pressable>
          <View style={{ height: 8 }} />
          <Pressable style={[styles.btn, styles.secondary]} onPress={onMainMenu}>
            <Text style={styles.btnTxt}>Main Menu</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#111", padding: 20, borderRadius: 16, width: 280, alignItems: "center" },
  title: { color: "white", fontSize: 20, fontWeight: "700" },
  btn: { backgroundColor: "#e53935", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, width: "100%", alignItems: "center" },
  secondary: { backgroundColor: "#455A64" },
  btnTxt: { color: "white", fontWeight: "600" }
});
