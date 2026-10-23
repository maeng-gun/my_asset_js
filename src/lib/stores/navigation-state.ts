'use client'

import { useSyncExternalStore, useMemo } from 'react'
import { format, subMonths } from 'date-fns'

export type TradeType = '투자자산' | '연금자산'

export interface TradingFormState {
  tradeType: TradeType
  account: string
  currency: string
  tradeDate: string
  selectedTicker: string
  buyQ: number
  buyAmt: number
  buyCash: number
  sellQ: number
  sellPrincipal: number
  sellAmt: number
  dividend: number
  cashIn: number
  inOut: number
  limitCount: number
  selectedRowId: number | null
}

export interface TradingFiltersState {
  totalStartDate: string
  totalEndDate: string
  selAssetClass: string
  selAssetClass1: string
  selAssetClass2: string
  selAccount: string
  selProductName: string
}

export interface AssetSettingsFormState {
  tradeType: TradeType
  isEditing: boolean
  editId: number | null
  account: string
  ticker: string
  assName: string
  commName: string
  assClass: string
  assClass1: string
  assClass2: string
  assCur: string
  evalPrice: number
  maturityDate: string
}

export type TradingTab = 'history' | 'asset' | 'group' | 'total' | 'aggregate' | 'assets' | string
export type HoldingsTab = 'allocation' | 'commodity1' | 'commodity2' | 'commodity3' | string

export interface NavigationState {
  tradingForm: TradingFormState
  tradingFilters: TradingFiltersState
  tradingTab: TradingTab
  assetSettingsForm: AssetSettingsFormState
  holdingsTab: HoldingsTab
}

export const DEFAULT_TRADING_FORM: TradingFormState = {
  tradeType: '투자자산',
  account: '한투',
  currency: '원화',
  tradeDate: format(new Date(), 'yyyy-MM-dd'),
  selectedTicker: '',
  buyQ: 0,
  buyAmt: 0,
  buyCash: 0,
  sellQ: 0,
  sellPrincipal: 0,
  sellAmt: 0,
  dividend: 0,
  cashIn: 0,
  inOut: 0,
  limitCount: 30,
  selectedRowId: null,
}

export const DEFAULT_TRADING_FILTERS: TradingFiltersState = {
  totalStartDate: format(subMonths(new Date(), 6), 'yyyy-MM-dd'),
  totalEndDate: format(new Date(), 'yyyy-MM-dd'),
  selAssetClass: '전체',
  selAssetClass1: '전체',
  selAssetClass2: '전체',
  selAccount: '전체',
  selProductName: '전체',
}

export const DEFAULT_ASSET_SETTINGS_FORM: AssetSettingsFormState = {
  tradeType: '투자자산',
  isEditing: false,
  editId: null,
  account: '',
  ticker: '',
  assName: '',
  commName: '',
  assClass: '',
  assClass1: '',
  assClass2: '',
  assCur: '',
  evalPrice: 0,
  maturityDate: format(new Date(), 'yyyy-MM-dd'),
}

export const DEFAULT_TRADING_TAB: TradingTab = 'history'
export const DEFAULT_HOLDINGS_TAB: HoldingsTab = 'allocation'

export const DEFAULT_NAVIGATION_STATE: NavigationState = {
  tradingForm: DEFAULT_TRADING_FORM,
  tradingFilters: DEFAULT_TRADING_FILTERS,
  tradingTab: DEFAULT_TRADING_TAB,
  assetSettingsForm: DEFAULT_ASSET_SETTINGS_FORM,
  holdingsTab: DEFAULT_HOLDINGS_TAB,
}

const STORAGE_KEY = 'my_asset_navigation_state'

function loadFromSessionStorage(): NavigationState {
  if (typeof window === 'undefined') {
    return DEFAULT_NAVIGATION_STATE
  }
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_NAVIGATION_STATE
    const parsed = JSON.parse(raw)
    return {
      tradingForm: { ...DEFAULT_TRADING_FORM, ...(parsed.tradingForm || {}) },
      tradingFilters: { ...DEFAULT_TRADING_FILTERS, ...(parsed.tradingFilters || {}) },
      tradingTab: parsed.tradingTab ?? DEFAULT_TRADING_TAB,
      assetSettingsForm: { ...DEFAULT_ASSET_SETTINGS_FORM, ...(parsed.assetSettingsForm || {}) },
      holdingsTab: parsed.holdingsTab ?? DEFAULT_HOLDINGS_TAB,
    }
  } catch {
    return DEFAULT_NAVIGATION_STATE
  }
}

function saveToSessionStorage(state: NavigationState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota or access errors
  }
}

let currentState: NavigationState = loadFromSessionStorage()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (e) {
      console.error(e)
    }
  })
}

export function setNavigationState(
  updater: Partial<NavigationState> | ((prev: NavigationState) => NavigationState)
) {
  const next = typeof updater === 'function' ? updater(currentState) : { ...currentState, ...updater }
  currentState = next
  saveToSessionStorage(currentState)
  notify()
}

export function setTradingForm(
  updater: Partial<TradingFormState> | ((prev: TradingFormState) => TradingFormState)
) {
  const nextForm = typeof updater === 'function' ? updater(currentState.tradingForm) : { ...currentState.tradingForm, ...updater }
  currentState = {
    ...currentState,
    tradingForm: nextForm,
  }
  saveToSessionStorage(currentState)
  notify()
}

export function resetTradingForm() {
  setTradingForm({
    ...DEFAULT_TRADING_FORM,
    tradeDate: format(new Date(), 'yyyy-MM-dd'),
    selectedRowId: null,
  })
}

export function setTradingFilters(
  updater: Partial<TradingFiltersState> | ((prev: TradingFiltersState) => TradingFiltersState)
) {
  const nextFilters = typeof updater === 'function' ? updater(currentState.tradingFilters) : { ...currentState.tradingFilters, ...updater }
  currentState = {
    ...currentState,
    tradingFilters: nextFilters,
  }
  saveToSessionStorage(currentState)
  notify()
}

export function resetTradingFilters() {
  setTradingFilters(DEFAULT_TRADING_FILTERS)
}

export function setTradingTab(tab: TradingTab) {
  if (currentState.tradingTab === tab) return
  currentState = {
    ...currentState,
    tradingTab: tab,
  }
  saveToSessionStorage(currentState)
  notify()
}

export function setAssetSettingsForm(
  updater: Partial<AssetSettingsFormState> | ((prev: AssetSettingsFormState) => AssetSettingsFormState)
) {
  const nextForm = typeof updater === 'function' ? updater(currentState.assetSettingsForm) : { ...currentState.assetSettingsForm, ...updater }
  currentState = {
    ...currentState,
    assetSettingsForm: nextForm,
  }
  saveToSessionStorage(currentState)
  notify()
}

export function resetAssetSettingsForm(keepTradeType = true) {
  setAssetSettingsForm((prev) => ({
    ...DEFAULT_ASSET_SETTINGS_FORM,
    tradeType: keepTradeType ? prev.tradeType : '투자자산',
    maturityDate: format(new Date(), 'yyyy-MM-dd'),
    editId: null,
    isEditing: false,
  }))
}

export function setHoldingsTab(tab: HoldingsTab) {
  if (currentState.holdingsTab === tab) return
  currentState = {
    ...currentState,
    holdingsTab: tab,
  }
  saveToSessionStorage(currentState)
  notify()
}

// Direct store objects (for headless / test inspection)
export const navigationStore = {
  getState: () => currentState,
  setState: setNavigationState,
  subscribe,
}

export const tradingFormStore = {
  getState: () => currentState.tradingForm,
  setState: setTradingForm,
  reset: resetTradingForm,
  subscribe,
}

export const tradingFiltersStore = {
  getState: () => currentState.tradingFilters,
  setState: setTradingFilters,
  reset: resetTradingFilters,
  subscribe,
}

export const tradingTabStore = {
  getState: () => currentState.tradingTab,
  setState: setTradingTab,
  subscribe,
}

export const assetSettingsStore = {
  getState: () => currentState.assetSettingsForm,
  setState: setAssetSettingsForm,
  reset: resetAssetSettingsForm,
  subscribe,
}

export const holdingsTabStore = {
  getState: () => currentState.holdingsTab,
  setState: setHoldingsTab,
  subscribe,
}

// React Hooks backed by useSyncExternalStore
export function useTradingFormStore() {
  const form = useSyncExternalStore(
    subscribe,
    () => currentState.tradingForm,
    () => DEFAULT_NAVIGATION_STATE.tradingForm
  )

  return useMemo(() => {
    const tuple = [form, setTradingForm] as const
    return Object.assign(tuple, {
      form,
      setForm: setTradingForm,
      setTradingForm,
      resetForm: resetTradingForm,
      resetTradingForm,
      ...form,
    })
  }, [form])
}

export function useTradingFiltersStore() {
  const filters = useSyncExternalStore(
    subscribe,
    () => currentState.tradingFilters,
    () => DEFAULT_NAVIGATION_STATE.tradingFilters
  )

  return useMemo(() => {
    const tuple = [filters, setTradingFilters] as const
    return Object.assign(tuple, {
      filters,
      setFilters: setTradingFilters,
      setTradingFilters,
      resetFilters: resetTradingFilters,
      resetTradingFilters,
      ...filters,
    })
  }, [filters])
}

export function useTradingTabStore() {
  const tab = useSyncExternalStore(
    subscribe,
    () => currentState.tradingTab,
    () => DEFAULT_NAVIGATION_STATE.tradingTab
  )

  return useMemo(() => {
    const tuple = [tab, setTradingTab] as const
    return Object.assign(tuple, {
      tradingTab: tab,
      setTradingTab,
      activeTab: tab,
      setActiveTab: setTradingTab,
    })
  }, [tab])
}

export function useAssetSettingsStore() {
  const form = useSyncExternalStore(
    subscribe,
    () => currentState.assetSettingsForm,
    () => DEFAULT_NAVIGATION_STATE.assetSettingsForm
  )

  return useMemo(() => {
    const tuple = [form, setAssetSettingsForm] as const
    return Object.assign(tuple, {
      form,
      setForm: setAssetSettingsForm,
      setAssetSettingsForm,
      resetForm: resetAssetSettingsForm,
      resetAssetSettingsForm,
      ...form,
    })
  }, [form])
}

export function useHoldingsTabStore() {
  const tab = useSyncExternalStore(
    subscribe,
    () => currentState.holdingsTab,
    () => DEFAULT_NAVIGATION_STATE.holdingsTab
  )

  return useMemo(() => {
    const tuple = [tab, setHoldingsTab] as const
    return Object.assign(tuple, {
      holdingsTab: tab,
      setHoldingsTab,
      activeTab: tab,
      setActiveTab: setHoldingsTab,
    })
  }, [tab])
}

export function useNavigationStore() {
  const state = useSyncExternalStore(
    subscribe,
    () => currentState,
    () => DEFAULT_NAVIGATION_STATE
  )

  return useMemo(() => {
    return {
      state,
      setNavigationState,
      tradingForm: state.tradingForm,
      setTradingForm,
      resetTradingForm,
      tradingFilters: state.tradingFilters,
      setTradingFilters,
      resetTradingFilters,
      tradingTab: state.tradingTab,
      setTradingTab,
      assetSettingsForm: state.assetSettingsForm,
      setAssetSettingsForm,
      resetAssetSettingsForm,
      holdingsTab: state.holdingsTab,
      setHoldingsTab,
    }
  }, [state])
}
