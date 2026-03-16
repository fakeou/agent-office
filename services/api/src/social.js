function createSocialService({ db }) {
  // Phase 4 placeholder — friends and access permissions

  function getFriends(userId) {
    return [];
  }

  function getWorkshopVisibility(userId) {
    return "private";
  }

  return {
    getFriends,
    getWorkshopVisibility
  };
}

module.exports = {
  createSocialService
};
