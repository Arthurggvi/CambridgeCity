import { HEATCORRIDOR_SHOP_GOODS_ICON_SVGS } from "./shop_goods_assets/heatcorridor_goods_icons.js";

const CORE_SHOP_GOODS_ICON_SVGS = Object.freeze({
  cup_noodles: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 5.5H17L15.4 18H8.6L7 5.5Z" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8.5 9H15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M9 3.5H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
  battery_pack: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M18 10H20V14H18" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8.5 9.5V14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M6 12H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
  cigarette_pack: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="5" width="12" height="14" rx="1.6" stroke="currentColor" stroke-width="1.5"/>
      <path d="M6 9H18" stroke="currentColor" stroke-width="1.5"/>
      <path d="M9 5V9" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12 5V9" stroke="currentColor" stroke-width="1.5"/>
      <path d="M15 5V9" stroke="currentColor" stroke-width="1.5"/>
    </svg>`,
  pill_box: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="6" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12 8.5V15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8.5 12H15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
  utility_bundle: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="7" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 7V5.5H16V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M9 11H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M9 14H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
});

const SHOP_GOODS_ICON_SVGS = Object.freeze({
  ...CORE_SHOP_GOODS_ICON_SVGS,
  ...HEATCORRIDOR_SHOP_GOODS_ICON_SVGS
});

export function renderShopGoodsIconSvg(iconId) {
  return SHOP_GOODS_ICON_SVGS[String(iconId || "").trim()] || SHOP_GOODS_ICON_SVGS.utility_bundle;
}
