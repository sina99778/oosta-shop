// Shared API response types for the storefront.

export type ProductType = "ACCOUNT" | "LICENSE" | "GIFTCARD";

export type Category = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export type CategoryRef = { id: string; name: string; slug: string };

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  hasImage: boolean;
  type: ProductType;
  category: CategoryRef;
  priceFrom: number | null;
  originalPriceFrom: number | null;
  discountPercent: number;
  currency: string;
  availableStock: number;
  inStock: boolean;
  lowStock: boolean;
  isFeatured: boolean;
  ratingAverage: number;
  ratingCount: number;
  soldCount?: number;
};

export type PlanDetail = {
  id: string;
  label: string;
  durationDays: number | null;
  price: number;
  salePrice: number | null;
  effectivePrice: number;
  onSale: boolean;
  discountPercent: number;
  currency: string;
  availableStock: number;
  inStock: boolean;
};

export type SpecRow = { label: string; value: string };

export type ProductReview = {
  id: string;
  rating: number;
  comment: string | null;
  userName: string;
  createdAt: string;
};

export type ProductDetail = ProductSummary & {
  shortDescription: string | null;
  description: string;
  specs: SpecRow[];
  galleryImageIds: string[];
  plans: PlanDetail[];
  rating: { average: number; count: number };
  reviews: ProductReview[];
  related: ProductSummary[];
};

// Admin review moderation
export type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user: { name: string; email: string | null; phone: string | null };
  product: { name: string; slug: string };
};

export type AdminReviewList = {
  items: AdminReview[];
  pendingCount: number;
  pagination: Pagination;
};

// Support tickets
export type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";
export type TicketMessage = { id: string; body: string; isStaff: boolean; createdAt: string };
export type TicketListItem = {
  id: string;
  subject: string;
  status: TicketStatus;
  messageCount: number;
  lastMessage: string;
  updatedAt: string;
};
export type TicketDetail = {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
};
type TicketUser = { id: string; name: string; email: string | null; phone: string | null };
export type AdminTicketListItem = {
  id: string;
  subject: string;
  status: TicketStatus;
  messageCount: number;
  updatedAt: string;
  user: TicketUser;
};
export type AdminTicketList = {
  items: AdminTicketListItem[];
  openCount: number;
  pagination: Pagination;
};
export type AdminTicketDetail = TicketDetail & { user: TicketUser };

// Admin sales dashboard
export type AdminStats = {
  currency: string;
  revenueTotal: number;
  revenue30: number;
  paidOrders: number;
  totalOrders: number;
  pendingReview: number;
  customers: number;
  salesByDay: { day: string; count: number; revenue: number }[];
  topProducts: { id: string; name: string; unitsSold: number }[];
  lowStock: { id: string; name: string; stock: number }[];
  recentOrders: {
    id: string;
    totalAmount: number;
    currency: string;
    paymentStatus: string;
    itemCount: number;
    createdAt: string;
    user: { name: string; email: string | null; phone: string | null };
  }[];
};

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type Paginated<T> = { items: T[]; pagination: Pagination };

export type OrderSummary = {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  itemCount: number;
  createdAt: string;
  paidAt: string | null;
};

export type Credential = {
  id: string;
  type: ProductType;
  accountEmail: string | null;
  accountPassword: string | null;
  licenseKey: string | null;
  giftCardCode: string | null;
};

export type OrderItemDetail = {
  id: string;
  product: { id: string; name: string; slug: string; type: ProductType };
  plan: { id: string; label: string };
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  credentials: Credential[];
};

export type CardInfo = { number: string; holder: string; bank: string };

export type ReceiptInfo = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reference: string | null;
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type OrderDetail = {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentRefId: string | null;
  createdAt: string;
  paidAt: string | null;
  items: OrderItemDetail[];
  receipts: ReceiptInfo[];
  cardToCard: CardInfo | null;
};

export type PaymentMethod = "online" | "card_to_card";

export type PaymentConfig = {
  online: boolean;
  cardToCard: boolean;
  card: CardInfo | null;
};

export type CreateOrderResponse = {
  order: { id: string; totalAmount: number; currency: string; paymentStatus: string };
  payment?: { authority: string; redirectUrl: string };
  cardToCard?: CardInfo & { amount: number; currency: string };
};

// Admin receipt review (queue + history)
export type AdminReceipt = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reference: string | null;
  reviewerNote: string | null;
  mimeType: string;
  createdAt: string;
  reviewedAt: string | null;
  order: {
    id: string;
    totalAmount: number;
    currency: string;
    paymentStatus: string;
    paymentProvider: string | null;
    createdAt: string;
    user: { id: string; name: string; email: string | null; phone: string | null };
  };
};

export type AdminReceiptList = {
  items: AdminReceipt[];
  pendingCount: number;
  pagination: Pagination;
};
