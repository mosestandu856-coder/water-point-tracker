// frontend/src/constants/labels.js
// Central shared dictionary for all UI text across the Admin area.
// Adheres strictly to Plain English guidelines:
// - Short sentences, simple words, no technical jargon or abbreviations.
// - Action buttons begin with a verb.
// - All UI copy references this file to ensure zero stale jargon strings.

export const LABELS = {
  // Navigation Tabs (A1, B1)
  TABS: {
    REQUESTS: "Requests",
    USERS: "Users",
    ACTIVITY_LOG: "Activity log"
  },

  // Page Titles & Help Lines (A3, B1)
  PAGES: {
    MANAGE_USERS: "Manage users",
    BANNER_HELP: "Approve new accounts, manage users, and see who did what.",
    REQUESTS_HELP: "Review and approve new volunteer and staff accounts.",
    USERS_HELP: "Create, update, disable, or reset access for system users.",
    ACTIVITY_LOG_HELP: "See recent actions, sign-ins, and system changes."
  },

  // Table Column Headers (B1, C3)
  COLUMNS: {
    NAME: "Name",
    PHONE: "Phone number",
    ROLE: "Role",
    COMMUNITY_OR_TECH: "Community or technician",
    STATUS: "Status",
    LAST_SIGN_IN: "Last sign-in",
    ACTIONS: "Actions",
    DATE: "Date",
    ACTION_TAKEN: "Action taken",
    DETAILS: "Details"
  },

  // Action Buttons (B1, B2)
  BUTTONS: {
    ADD_USER: "Add user",
    APPROVE: "Approve",
    REJECT: "Reject",
    CHANGE_ROLE: "Change role",
    RESET_PASSWORD: "Reset password",
    DISABLE: "Disable",
    ENABLE: "Enable",
    CANCEL: "Cancel",
    CONFIRM: "Confirm",
    CLOSE: "Close",
    SEARCH: "Search",
    CLEAR_FILTERS: "Clear filters"
  },

  // Empty States (B1, B4)
  EMPTY_STATES: {
    NO_REQUESTS: "No requests waiting.",
    NO_USERS_FOUND: "No users match your search or filter.",
    NO_ACTIVITY: "No activity recorded yet."
  },

  // Notifications / Header Alerts (A6)
  NOTIFICATIONS: {
    HEADER_LABEL_ADMIN: "Action items",
    HEADER_LABEL_DEFAULT: "Notifications"
  },

  // Officer Dashboard — Navigation tabs (A1)
  OFFICER_TABS: {
    OVERVIEW:     "Overview",
    REPAIR_QUEUE: "Repair queue",
    WATER_POINTS: "Water points",
    REPORTS:      "Reports"
  },

  // Officer Dashboard — Page help lines (A7)
  OFFICER_HELP: {
    OVERVIEW:     "A snapshot of all water points and the highest-priority problem right now.",
    REPAIR_QUEUE: "Reports waiting for a technician, sorted by urgency.",
    WATER_POINTS: "All six water points and their current status.",
    REPORTS:      "Completed repairs, costs, and service history."
  },

  // Officer Dashboard — Card labels (A3 / B1)
  OFFICER_CARDS: {
    BROKEN:           "Broken",
    LOW_WATER:        "Low water",
    WAITING_TECH:     "Waiting for a technician",
    HOUSEHOLDS:       "Households affected"
  },

  // Officer Dashboard — Banner & action labels (B2 / B3 / C2)
  OFFICER_BANNER: {
    TITLE:           "Needs a technician now",
    BUTTON:          "Choose a technician",
    WAITING_PREFIX:  "Waiting"
  },

  // Officer Dashboard — Section titles (C2 / A5)
  OFFICER_SECTIONS: {
    NEEDS_ATTENTION:   "Needs attention first",
    REPAIR_QUEUE_TITLE: "Repair queue",
    AVG_DAYS_ASSIGN:   "Average days to assign a technician",
    AVG_DAYS_FIX:      "Average days to fix",
    COST_BY_TYPE:      "Repair cost by water point type",
    WP_PER_COMMUNITY:  "Water points per community",
    TECH_WORKLOAD:     "Technician workload",
    SERVICE_BACKLOG:   "Water points not serviced in 12 months",
    REPORT_PROBLEM:    "Report a problem"
  },

  // Officer Dashboard — Table column headers (C2)
  OFFICER_COLUMNS: {
    WATER_POINT_TYPE: "Water point type",
    REPAIRS:          "Repairs",
    TOTAL_COST:       "Total cost",
    AVG_COST:         "Average cost"
  },

  // Officer Dashboard — Empty / no-data states (C5 / B6)
  OFFICER_EMPTY: {
    NO_ASSIGN_DATA:   "No data yet",
    NO_ASSIGN_HELP:   "This fills in after a technician is assigned.",
    NO_FIX_DATA:      "No data yet",
    NO_FIX_HELP:      "This fills in after the first repair is completed.",
    NO_ATTENTION:     "No open reports right now.",
    NO_QUEUE:         "No reports match this filter. Try clearing your search or switching to \"All\".",
    NO_WP_DATA:       "No water point data available. Check your connection or refresh the page.",
    NO_COST_DATA:     "No completed repairs with a recorded cost yet. Costs appear once repairs are marked fixed.",
    NO_BACKLOG:       "All water points have been serviced in the last 12 months."
  },

  // Roles Display (Human readable)
  ROLES: {
    ADMIN: "Admin",
    OFFICER: "Officer",
    COMMUNITY: "Community contact",
    TECHNICIAN: "Technician",
    VOLUNTEER: "Volunteer"
  },

  // Status Display
  STATUS: {
    ACTIVE: "Active",
    DISABLED: "Disabled",
    PENDING: "Pending",
    NONE: "None"
  }
};

export default LABELS;
