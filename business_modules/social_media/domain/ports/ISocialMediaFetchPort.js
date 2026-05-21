/**
 * Port for live or cached social-platform post retrieval.
 */
export class ISocialMediaFetchPort {
  /**
   * @param {{ topic: string, platforms: string[], maxResults?: number }} _opts
   * @returns {Promise<{ posts: object[], source: string, accessNotes?: string[] }>}
   */
  async fetchByTopic(_opts) {
    throw new Error('ISocialMediaFetchPort.fetchByTopic not implemented');
  }
}
