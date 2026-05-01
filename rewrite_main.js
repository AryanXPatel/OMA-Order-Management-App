const fs = require('fs');

const FILE_PATH = 'd:/dev/OMA/OMA-Order-Management-App/app/(app)/main.tsx';
const content = fs.readFileSync(FILE_PATH, 'utf8');

// The marker for where business logic ends and presentation components begin.
const markerMetricCard = 'const MetricCard = ({';
const markerMainStart = 'export default function MainScreen() {';
const markerMainStyles = 'const styles = useMemo(';

const logicSection = content.substring(0, content.indexOf(markerMetricCard));
const hookSection = content.substring(content.indexOf(markerMainStart), content.indexOf(markerMainStyles));

const bentoComponents = `
// BENTO COMPONENTS REPLACEMENT
const MetricCard = ({ label, value, accentColor, colors }) => {
  return (
    <View style={{
      width: 140,
      height: 140,
      backgroundColor: colors.card,
      borderRadius: 32,
      padding: 20,
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 16,
      overflow: 'hidden'
    }}>
      <View style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: \`\${accentColor}1A\`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Ionicons color={accentColor} name="analytics-outline" size={18} />
      </View>
      <View>
        <Text style={{
          color: colors.text,
          fontSize: 24,
          fontFamily: omaTypography.extrabold,
          letterSpacing: -0.5,
          marginBottom: 4,
        }}>
          {value}
        </Text>
        <Text style={{
          color: colors.textSecondary,
          fontSize: 12,
          fontFamily: omaTypography.semibold,
          lineHeight: 16,
        }}>
          {label}
        </Text>
      </View>
    </View>
  );
};

const QuickActionButton = ({ label, icon, onPress, primary, colors }) => {
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: "center", width: "23%" }}>
      <View style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: primary ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: primary ? colors.primary : colors.border,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <Ionicons color={primary ? "#000000" : colors.text} name={icon} size={24} />
      </View>
      <Text style={{
        color: colors.textSecondary,
        fontSize: 12,
        fontFamily: omaTypography.semibold,
        textAlign: "center",
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

`;

const bentoAppEnd = `
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 140 }, // Space for floating nav
    ambientGlow: {
      position: 'absolute',
      width: 600,
      height: 600,
      borderRadius: 300,
      backgroundColor: colors.primary,
      opacity: 0.05,
      top: -200,
      left: -100,
      transform: [{ scaleX: 1.5 }],
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: insets.top + 20,
      marginBottom: 32,
    },
    avatarWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: colors.primary,
      fontSize: 20,
      fontFamily: omaTypography.extrabold,
    },
    greetingText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: omaTypography.medium,
      marginBottom: 4,
    },
    nameText: {
      color: colors.text,
      fontSize: 20,
      fontFamily: omaTypography.bold,
      letterSpacing: -0.5,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    iconButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      marginBottom: 40,
    },
    sectionTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
      paddingHorizontal: 24,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 20,
      fontFamily: omaTypography.extrabold,
      letterSpacing: -0.5,
    },
    quickActionsPad: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 24,
    },
    bentoWide: {
      marginHorizontal: 24,
      backgroundColor: colors.card,
      borderRadius: 32,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    bentoSubtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: omaTypography.semibold,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 8,
    },
    bentoTitle: {
      color: colors.text,
      fontSize: 36,
      fontFamily: omaTypography.extrabold,
      letterSpacing: -1,
      marginBottom: 24,
    },
    bentoDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 20,
    },
    overlayBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: '90%',
      backgroundColor: colors.surface,
      borderRadius: 32,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontFamily: omaTypography.medium,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    closeText: {
      color: colors.primary,
      fontFamily: omaTypography.bold,
      fontSize: 16,
    },
    loadingText: {
      color: colors.textSecondary,
      marginTop: 16,
      fontFamily: omaTypography.medium,
      fontSize: 14,
    }
  }), [colors, isDark, insets.top]);

  if (loading && !payload) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading workspace...</Text>
      </View>
    );
  }

  if (!payload || !userRole) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons color={colors.textSecondary} name="cloud-offline-outline" size={44} />
        <Text style={styles.loadingText}>Data unavailable.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.ambientGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} tintColor={colors.primary} />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setActiveOverlay(current => current === "profile" ? null : "profile")} style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(userRole || "U").slice(0, 1)}</Text>
            </View>
            <View>
              <Text style={styles.greetingText}>{greeting}</Text>
              <Text style={styles.nameText}>{userRole}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={() => setActiveOverlay("search")} style={styles.iconButton}>
              <Ionicons color={colors.text} name="search-outline" size={20} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveOverlay("notifications")} style={styles.iconButton}>
              <Ionicons color={colors.text} name="notifications-outline" size={20} />
              {notificationItems.length > 0 && (
                <View style={{
                  position: 'absolute', top: 12, right: 12, width: 8, height: 8,
                  borderRadius: 4, backgroundColor: colors.primary
                }} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
            {metricCards.map(metric => (
              <MetricCard key={metric.id} {...metric} colors={colors} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Command Center</Text>
            <TouchableOpacity onPress={() => router.push("/(app)/my-orders")}>
              <Text style={{ color: colors.textSecondary, fontFamily: omaTypography.bold }}>View all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickActionsPad}>
            {quickActions.map(action => (
              <QuickActionButton key={action.id} {...action} colors={colors} onPress={() => router.push(action.route)} />
            ))}
          </View>
        </View>

        <View style={styles.bentoWide}>
          <Text style={styles.bentoSubtitle}>Month to Date</Text>
          <Text style={styles.bentoTitle}>₹{formatIndianCurrency(payload.monthValue)}</Text>
          
          <View style={styles.bentoDivider} />
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: colors.textSecondary, fontFamily: omaTypography.medium, fontSize: 13, marginBottom: 4 }}>Completed</Text>
              <Text style={{ color: colors.text, fontFamily: omaTypography.bold, fontSize: 16 }}>{payload.completedOrders} orders</Text>
            </View>
            <View>
              <Text style={{ color: colors.textSecondary, fontFamily: omaTypography.medium, fontSize: 13, marginBottom: 4 }}>Pending</Text>
              <Text style={{ color: colors.accentOrange, fontFamily: omaTypography.bold, fontSize: 16 }}>{payload.pendingApprovals} orders</Text>
            </View>
          </View>
        </View>
        
        {payload.currentOrder && (
          <TouchableOpacity onPress={() => router.push("/(app)/my-orders")} style={styles.bentoWide}>
             <Text style={styles.bentoSubtitle}>Active Workflow</Text>
             <View style={{flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12}}>
               <View style={{width: 48, height: 48, borderRadius: 24, backgroundColor: \`\${colors.accentBlue}1A\`, alignItems: 'center', justifyContent: 'center'}}>
                 <Ionicons name="cube-outline" size={24} color={colors.accentBlue} />
               </View>
               <View>
                 <Text style={{color: colors.text, fontFamily: omaTypography.bold, fontSize: 18}}>{payload.currentOrder.customerName}</Text>
                 <Text style={{color: colors.textSecondary, fontFamily: omaTypography.medium, fontSize: 14}}>{payload.currentOrder.orderId}</Text>
               </View>
             </View>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* OVERLAYS */}
      <Modal visible={activeOverlay === "search"} transparent animationType="fade">
         <Pressable onPress={() => setActiveOverlay(null)} style={styles.overlayBackdrop}>
           <View style={[styles.modalCard, { marginTop: -200 }]}>
             <View style={styles.searchRow}>
               <TextInput 
                 autoFocus 
                 placeholder="Search workspace..." 
                 placeholderTextColor={colors.textPlaceholder}
                 style={styles.searchInput}
                 value={searchQuery}
                 onChangeText={setSearchQuery} />
                 <TouchableOpacity onPress={() => setActiveOverlay(null)}>
                   <Text style={styles.closeText}>Close</Text>
                 </TouchableOpacity>
             </View>
           </View>
         </Pressable>
      </Modal>

      <Modal visible={activeOverlay === "profile"} transparent animationType="fade">
         <Pressable onPress={() => setActiveOverlay(null)} style={styles.overlayBackdrop}>
           <View style={styles.modalCard}>
             <Text style={{color: colors.text, fontSize: 24, fontFamily: omaTypography.bold, marginBottom: 24}}>Workspace Settings</Text>
             {profileActions.map(action => (
                <TouchableOpacity key={action.id} onPress={action.onPress} style={{flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border}}>
                  <Ionicons name={action.icon} size={24} color={colors.text} />
                  <Text style={{color: colors.text, fontSize: 16, fontFamily: omaTypography.semibold}}>{action.label}</Text>
                </TouchableOpacity>
             ))}
           </View>
         </Pressable>
      </Modal>

      <Modal visible={activeOverlay === "notifications"} transparent animationType="fade">
         <Pressable onPress={() => setActiveOverlay(null)} style={styles.overlayBackdrop}>
           <View style={styles.modalCard}>
             <Text style={{color: colors.text, fontSize: 24, fontFamily: omaTypography.bold, marginBottom: 24}}>Notifications</Text>
             {notificationItems.length === 0 ? (
               <Text style={{color: colors.textSecondary, fontFamily: omaTypography.medium}}>You are all caught up.</Text>
             ) : (
               notificationItems.map((item, idx) => (
                 <TouchableOpacity key={idx} onPress={() => { setActiveOverlay(null); router.push(item.route); }} style={{flexDirection: 'row', gap: 16, marginBottom: 20}}>
                   <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center'}}>
                     <Ionicons name={item.icon} size={20} color={item.color} />
                   </View>
                   <View style={{flex: 1}}>
                     <Text style={{color: colors.text, fontSize: 16, fontFamily: omaTypography.bold}}>{item.title}</Text>
                     <Text style={{color: colors.textSecondary, fontSize: 14, fontFamily: omaTypography.medium, marginTop: 4}}>{item.body}</Text>
                   </View>
                 </TouchableOpacity>
               ))
             )}
           </View>
         </Pressable>
      </Modal>

    </View>
  );
}
`;

const finalFile = logicSection + bentoComponents + hookSection + bentoAppEnd;
fs.writeFileSync(FILE_PATH, finalFile, 'utf8');
console.log('Successfully rebuilt main.tsx Bento UI Layout');
