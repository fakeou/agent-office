const DISPLAY_STATES = {
  IDLE: "idle",
  WORKING: "working",
  APPROVAL: "approval",
  ATTENTION: "attention"
};

const DISPLAY_ZONES = {
  idle: "idle-zone",
  working: "working-zone",
  approval: "approval-zone",
  attention: "attention-zone"
};

function displayZoneFor(state) {
  return DISPLAY_ZONES[state] || DISPLAY_ZONES.working;
}

module.exports = {
  DISPLAY_STATES,
  DISPLAY_ZONES,
  displayZoneFor
};
