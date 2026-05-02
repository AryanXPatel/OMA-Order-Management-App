import React from "react";
import type { LucideProps } from "lucide-react-native";
import {
  Activity,
  AlertCircle,
  ArrowDownCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart2,
  Barcode,
  Bell,
  BriefcaseBusiness,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronRightCircle,
  ChevronUp,
  Clipboard,
  Clock3,
  CloudOff,
  Eye,
  EyeOff,
  FileText,
  FileClock,
  Globe,
  Grid2x2,
  Home,
  Hourglass,
  Info,
  LayoutGrid,
  Layers,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Moon,
  MoreHorizontal,
  Package,
  PackageOpen,
  Phone,
  Plus,
  PlusCircle,
  QrCode,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Square,
  Sparkles,
  Sun,
  Tag,
  User,
  Users,
  Wallet,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

type IconMapEntry = {
  component: LucideIcon;
  strokeWidth?: number;
};

const iconMap = {
  add: { component: Plus },
  "add-circle": { component: PlusCircle },
  "add-circle-outline": { component: PlusCircle },
  "add-outline": { component: Plus },
  "albums-outline": { component: LayoutGrid },
  "alert-circle": { component: AlertCircle },
  "alert-circle-outline": { component: AlertCircle },
  "apps-outline": { component: Grid2x2 },
  "arrow-back": { component: ArrowLeft },
  "arrow-down-circle-outline": { component: ArrowDownCircle },
  "arrow-forward": { component: ArrowRight },
  "arrow-forward-outline": { component: ArrowRight },
  "arrow-up-outline": { component: ArrowUpRight },
  "barcode-outline": { component: Barcode },
  "briefcase-outline": { component: BriefcaseBusiness },
  calendar: { component: Calendar },
  "calendar-outline": { component: Calendar },
  "call-outline": { component: Phone },
  "cart-outline": { component: Package },
  "cash-outline": { component: BadgeDollarSign },
  "chatbubble-ellipses-outline": { component: MessageCircle },
  checkmark: { component: Check },
  "checkmark-circle": { component: CheckCircle2 },
  "checkmark-circle-outline": { component: CheckCircle2 },
  "checkmark-done-circle-outline": { component: CheckCircle2 },
  "checkbox": { component: CheckSquareIcon },
  "checkbox-outline": { component: CheckSquareIcon },
  "chevron-down": { component: ChevronDown },
  "chevron-forward": { component: ChevronRight },
  "chevron-forward-circle-outline": { component: ChevronRightCircle },
  "chevron-up": { component: ChevronUp },
  close: { component: X },
  "close-circle": { component: XCircle },
  "close-circle-outline": { component: XCircle },
  clipboard: { component: Clipboard },
  "clipboard-outline": { component: Clipboard },
  "cloud-offline-outline": { component: CloudOff },
  cube: { component: PackageOpen },
  "cube-outline": { component: PackageOpen },
  "document-text-outline": { component: FileText },
  "eye-off-outline": { component: EyeOff },
  "eye-outline": { component: Eye },
  "file-clock-outline": { component: FileClock },
  "flash-outline": { component: Zap },
  "git-compare-outline": { component: Layers },
  "globe-outline": { component: Globe },
  home: { component: Home },
  "home-outline": { component: Home },
  "hourglass-outline": { component: Hourglass },
  "information-circle": { component: Info },
  "layers-outline": { component: Layers },
  "location-outline": { component: MapPin },
  "lock-closed-outline": { component: Lock },
  "log-out-outline": { component: LogOut },
  "logo-whatsapp": { component: MessageCircle },
  "mail-outline": { component: Mail },
  "ellipsis-horizontal": { component: MoreHorizontal },
  "ellipsis-horizontal-outline": { component: MoreHorizontal },
  moon: { component: Moon },
  "notifications-outline": { component: Bell },
  "paper-plane-outline": { component: Send },
  people: { component: Users },
  "people-outline": { component: Users },
  "person-outline": { component: User },
  "pricetag-outline": { component: Tag },
  "pulse-outline": { component: Activity },
  "receipt-outline": { component: FileText },
  remove: { component: Minus },
  "scan-outline": { component: QrCode },
  "search-outline": { component: Search },
  "share-outline": { component: ShareIcon },
  "shield-checkmark-outline": { component: ShieldCheck },
  "sparkles-outline": { component: Sparkles },
  "square-outline": { component: Square },
  "stats-chart": { component: BarChart2 },
  "stats-chart-outline": { component: BarChart2 },
  "sunny": { component: Sun },
  "sunny-outline": { component: Sun },
  time: { component: Clock3 },
  "time-outline": { component: Clock3 },
  warning: { component: AlertCircle },
  "wallet-outline": { component: Wallet },
} as const satisfies Record<string, IconMapEntry>;

function ShareIcon(props: LucideProps) {
  return <Share2 {...props} />;
}

function CheckSquareIcon(props: LucideProps) {
  return <CheckSquare {...props} />;
}

export type AppIconName = keyof typeof iconMap;

type AppIconProps = {
  absoluteStrokeWidth?: boolean;
  color?: string;
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  style?: unknown;
};

const fallbackIcon: IconMapEntry = {
  component: AlertCircle,
};

const AppIconComponent = ({
  absoluteStrokeWidth,
  name,
  size = 24,
  color,
  strokeWidth,
  style,
}: AppIconProps) => {
  const entry = iconMap[name] || fallbackIcon;
  const Component = entry.component;

  return (
    <Component
      absoluteStrokeWidth={absoluteStrokeWidth}
      color={color}
      size={size}
      strokeWidth={strokeWidth ?? entry.strokeWidth ?? 2}
      style={style as never}
    />
  );
};

export const AppIcon = Object.assign(AppIconComponent, {
  glyphMap: iconMap,
});

export default AppIcon;
