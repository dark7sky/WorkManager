import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('mobile navigation keeps its column count in sync on small screens', () => {
  assert.match(
    styles,
    /\.mobile-nav\{height:calc\(64px \+ env\(safe-area-inset-bottom\)\);padding-bottom:env\(safe-area-inset-bottom\);grid-template-columns:repeat\(var\(--mobile-nav-columns,7\),minmax\(0,1fr\)\);box-shadow:0 -8px 24px rgba\(22,34,52,\.08\)\}/
  )
})
