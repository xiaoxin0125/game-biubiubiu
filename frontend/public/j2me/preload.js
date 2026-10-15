/* Site integration preload.
 *
 * The hosted runtime reads its content list from `config.jars`, which upstream
 * splits on ":" (its multi-JAR convention). The player hands over a blob: URL,
 * and blob URLs contain colons, so the list is provided directly here instead.
 * main-all.js prefers `window.__j2meJars` when it is set (one-line patch marked
 * with a comment there).
 */
(function () {
  try {
    var jar = new URLSearchParams(location.search).get('jar');
    if (jar) window.__j2meJars = [jar];
  } catch (error) {
    console.warn('j2me preload failed', error);
  }
}());
