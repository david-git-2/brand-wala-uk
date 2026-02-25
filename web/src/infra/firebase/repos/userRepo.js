import {
  createUser as fbCreateUser,
  getUserProfileByEmail as fbGetUserProfileByEmail,
  listUsers as fbListUsers,
  removeUser as fbRemoveUser,
  updateUser as fbUpdateUser,
} from "@/firebase/users";

/**
 * Firebase-backed user repository.
 * This is the single access layer for user profile CRUD from services.
 */
export function createFirebaseUserRepo() {
  return {
    /**
     * @param {string} email
     */
    async getByEmail(email) {
      return fbGetUserProfileByEmail(email);
    },

    async list() {
      return fbListUsers();
    },

    /**
     * @param {Object} input
     */
    async create(input) {
      await fbCreateUser(input);
      return fbGetUserProfileByEmail(input?.email || input?.user_email);
    },

    /**
     * @param {string} email
     * @param {Object} patch
     */
    async update(email, patch) {
      await fbUpdateUser(email, patch || {});
      return fbGetUserProfileByEmail(email);
    },

    /**
     * @param {string} email
     */
    async remove(email) {
      await fbRemoveUser(email);
      return { success: true };
    },

    async deactivate(email) {
      await fbUpdateUser(email, { active: 0 });
      return fbGetUserProfileByEmail(email);
    },
  };
}

export const userRepo = createFirebaseUserRepo();
