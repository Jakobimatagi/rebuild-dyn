const SLEEPER_CDN = "https://sleepercdn.com/avatars";

export function sleeperAvatarUrl(avatarId, { thumb = true } = {}) {
  if (!avatarId || typeof avatarId !== "string") return null;
  // user.metadata.avatar can be a full URL to a user-uploaded image.
  if (avatarId.startsWith("http://") || avatarId.startsWith("https://")) {
    return avatarId;
  }
  return `${SLEEPER_CDN}${thumb ? "/thumbs" : ""}/${avatarId}`;
}

export function resolveUserAvatar(user, opts) {
  if (!user) return null;
  return (
    sleeperAvatarUrl(user.metadata?.avatar, opts) ||
    sleeperAvatarUrl(user.avatar, opts)
  );
}
