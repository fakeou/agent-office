function createSocialService({ db }) {
  // Phase 4 placeholder — friends and access permissions

  function getFriends(userId) {
    return [];
  }

  function getOfficeVisibility(userId) {
    return "private";
  }

  return {
    getFriends,
    getOfficeVisibility
  };
}

module.exports = {
  createSocialService
};
