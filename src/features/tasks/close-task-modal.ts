import { router } from 'expo-router';

/** Closes a task modal, or goes to Today when it was opened with nothing underneath (TB-18). */
export function closeTaskModal() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
