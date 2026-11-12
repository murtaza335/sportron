import { Redirect } from 'expo-router';

/**
 * Any URL that matches no screen (mistyped link, removed page, old shared link) goes to the home
 * screen instead of expo-router's default "Unmatched Route" page. Root layout auth gating then
 * sends signed-out users on to /login as usual.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
