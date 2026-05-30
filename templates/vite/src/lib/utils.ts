import Document from "@7h3laughingman/foundry-types/common/abstract/document.mjs";

export const dev = import.meta.env.DEV;

export function isValidUpdater(data: Document, update?: Record<string, unknown>): boolean {
	const isThereAnActiveGM = game.users.activeGM;
	// No GM, see if you can do it yourself.
	if (!isThereAnActiveGM) return data.canUserModify(game.user, "update", update);
	// If there is a GM, you have to be the GM to update.
	return game.users.activeGM?.isSelf || false;
}