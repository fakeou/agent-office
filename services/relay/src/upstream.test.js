const test = require("node:test");
const assert = require("node:assert/strict");

const { describeUpstreamClose } = require("./upstream");

test("describeUpstreamClose includes close code and reason", () => {
  assert.equal(
    describeUpstreamClose({ code: 1006, reason: "abnormal_closure" }),
    "code=1006 reason=abnormal_closure"
  );
});

test("describeUpstreamClose reports missing details explicitly", () => {
  assert.equal(describeUpstreamClose({ code: undefined, reason: "" }), "no close details");
});
