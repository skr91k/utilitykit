export interface Trade {
  dateMilli?: number;
  qty?: number;
  symbol: string;
  tradePNL: number;
  type: string;
  value: number;
  positionTradedPrice?: number;
}

export interface DateEntry {
  bill: number;
  dateMilli: number;
  expense?: number;
  calculatedExpense?: number;
  grossBill: number;
  ntpl: number;
  tpl: number;
  trades: Trade[];
  name?: string;
}

export interface SwingTrade {
  symbol: string;
  qty: number;
  buyAtMilli: number;
  sellAtMilli: number;
  buyVal: number;
  sellVal: number;
  pnl: number;
}

export interface FiscalYear {
  expense?: number;
  grossBill?: number;
  netBill?: number;
  netTPL?: number;
  title: string;
  tpl?: number;
  pnl?: DateEntry[];
  swings?: SwingTrade[];
  top10Trades?: Trade[];
}

// PnLData is now an array of FiscalYear objects
export type PnLData = FiscalYear[];

// Linktree Types
export interface LinkItem {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  order: number;
  clicks?: number;
}

export interface SocialLink {
  [platform: string]: string;
}

export interface LinkPageMetadata {
  createdAt: number;
  updatedAt: number;
  totalClicks: number;
  viewCount: number;
}

export interface LinkPage {
  title: string;
  bio: string;
  avatar?: string;
  theme?: 'gradient' | 'minimal' | 'dark';
  socialLinks?: SocialLink;
  links: LinkItem[];
  metadata?: LinkPageMetadata;
}

export interface LinksData {
  [username: string]: LinkPage;
}
