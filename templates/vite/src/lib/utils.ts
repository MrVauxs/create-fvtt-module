import type Document from "@7h3laughingman/foundry-types/common/abstract/document.mjs";

export const dev = import.meta.env.DEV;

export function isValidUpdater(data: Document, update?: Record<string, unknown>): boolean {
	return game.users.getDesignatedUser((u => data.canUserModify(u, "update", update)))?.isSelf || false;
}