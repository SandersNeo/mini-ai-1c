import test from 'node:test';
import assert from 'node:assert/strict';

import { hasApplicableDiffBlocks } from '../diffViewer';

test('hasApplicableDiffBlocks returns false for a no-op SEARCH/REPLACE block', () => {
    const originalCode = [
        'Procedure Demo()',
        '\tMessage("ok");',
        'EndProcedure',
    ].join('\n');

    const diffContent = [
        '<<<<<<< SEARCH',
        '\tMessage("ok");',
        '=======',
        '\tMessage("ok");',
        '>>>>>>> REPLACE',
    ].join('\n');

    assert.equal(hasApplicableDiffBlocks(originalCode, diffContent), false);
});

test('hasApplicableDiffBlocks returns true when SEARCH/REPLACE changes the code', () => {
    const originalCode = [
        'Procedure Demo()',
        '\tMessage("old");',
        'EndProcedure',
    ].join('\n');

    const diffContent = [
        '<<<<<<< SEARCH',
        '\tMessage("old");',
        '=======',
        '\tMessage("new");',
        '>>>>>>> REPLACE',
    ].join('\n');

    assert.equal(hasApplicableDiffBlocks(originalCode, diffContent), true);
});

test('hasApplicableDiffBlocks returns true for a non-empty replacement on an empty base code', () => {
    const diffContent = [
        '<<<<<<< SEARCH',
        '=======',
        'Procedure Demo()',
        '\tMessage("new");',
        'EndProcedure',
        '>>>>>>> REPLACE',
    ].join('\n');

    assert.equal(hasApplicableDiffBlocks('', diffContent), true);
});
