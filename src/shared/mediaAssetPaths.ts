/** Access to these assets goes through the Worker; the path itself is not public. */
export const SCOPED_MEDIA_PATH = '/_site-media'

export const scopedMediaPath = (scope: string, id: string): string => `${SCOPED_MEDIA_PATH}/${scope}/${encodeURIComponent(id)}`
