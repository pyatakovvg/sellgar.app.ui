import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NavigationActivity } from './navigation-activity';

test('initial rendering has no pending navigation; the prepared page completes navigation', () => {
  const activity = new NavigationActivity();
  const changes: boolean[] = [];
  activity.subscribe(() => changes.push(activity.getSnapshot()));
  assert.equal(activity.getSnapshot(), false);
  activity.commitPage('/catalog');
  activity.beginNavigation('/offers/42');
  assert.equal(activity.getSnapshot(), true);
  activity.commitPage('/offers/42');
  assert.equal(activity.getSnapshot(), false);
  assert.deepEqual(changes, [true, false]);
});

test('another navigation can replace the destination or cancel back to the current page', () => {
  const activity = new NavigationActivity();
  activity.commitPage('/catalog');
  activity.beginNavigation('/catalog');
  assert.equal(activity.getSnapshot(), false);
  activity.beginNavigation('/offers/42');
  activity.beginNavigation('/offers/43');
  assert.equal(activity.getSnapshot(), true);
  activity.beginNavigation('/catalog');
  assert.equal(activity.getSnapshot(), false);
});

test('redirected pages complete pending navigation and application instances are isolated', () => {
  const activity = new NavigationActivity();
  const otherApplication = new NavigationActivity();
  activity.commitPage('/catalog');
  activity.beginNavigation('/offers/42');
  assert.equal(otherApplication.getSnapshot(), false);
  activity.commitPage('/not-found');
  assert.equal(activity.getSnapshot(), false);
});
