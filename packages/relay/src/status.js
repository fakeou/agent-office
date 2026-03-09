function createStatusManager({ upstream }) {
  function getUserStatus(userId) {
    return upstream.getStatusSummary(userId);
  }

  function isUserOnline(userId) {
    return upstream.isOnline(userId);
  }

  return {
    getUserStatus,
    isUserOnline
  };
}

module.exports = {
  createStatusManager
};
