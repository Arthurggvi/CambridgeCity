import { getCalendarViewFromTotalMinutes } from "./calendar_model.js";
import { normalizeInventory } from "./items_db.js";
import { isTheseusBoardingDate } from "./theseus_arrival_schedule.js";

export const THESEUS_CREW_APPROACH_EVENT_ID = "ev_steelcross_port_theseus_crew_intro";
export const THESEUS_CREW_RETURN_SHIP_EVENT_ID = "ev_steelcross_port_theseus_crew_return_ship";
export const THESEUS_CREW_DENIED_EVENT_ID = "ev_steelcross_port_theseus_crew_denied";
export const THESEUS_CREW_ASK_BOARDING_ACTION_ID = "theseus_crew_ask_boarding";
export const THESEUS_CREW_OPEN_DENIED_ACTION_ID = "theseus_crew_open_denied";
export const THESEUS_CREW_CONFIRM_BOARDING_ACTION_ID = "theseus_crew_confirm_boarding";
export const THESEUS_BOARDING_TICKET_ITEM_ID = "ticket_south_america_ship";
export const THESEUS_BOARDING_DIALOG_TITLE = "忒修斯号";
export const THESEUS_BOARDING_DIALOG_MESSAGE = "如此做后将不可撤销，故事将迎来结局，您确定吗？";
export const THESEUS_BOARDING_DIALOG_CONFIRM_LABEL = "确定";
export const THESEUS_BOARDING_DIALOG_CANCEL_LABEL = "返回";
export const THESEUS_ENDING_START_ACTION_ID = "theseus_ending_start";
export const THESEUS_ENDING_MIDPOINT_ACTION_ID = "theseus_ending_midpoint";
export const THESEUS_ENDING_FINISH_ACTION_ID = "theseus_ending_finish";
export const THESEUS_ENDING_MASKED_TIME_LABEL = "早？？年？？日 6:28";
export const THESEUS_ENDING_FINAL_MAP_ID = "tucson_home";
export const THESEUS_ENDING_PAGE_01_MAP_ID = "theseus_ending_01";
export const THESEUS_ENDING_PAGE_12_MAP_ID = "theseus_ending_12";

export function resolveTheseusBoardingEligibility(state) {
  const totalMinutes = Number(state?.time?.totalMinutes ?? 0);
  const calendarView = getCalendarViewFromTotalMinutes(totalMinutes, state?.world || {});
  const inventory = normalizeInventory(state?.player?.inventory);
  const hasTicket = inventory.some((row) => row?.itemId === THESEUS_BOARDING_TICKET_ITEM_ID && Number(row?.qty || 0) > 0);
  const isBoardingDate = isTheseusBoardingDate(totalMinutes, state?.world || {});

  return {
    calendarView,
    hasTicket,
    isBoardingDate,
    isEligible: isBoardingDate && hasTicket
  };
}