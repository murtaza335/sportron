/**
 * Copy for the "sign in to continue" prompt (docs/guest-mode/PLAN.md, step 3). Pure data, no React.
 *
 * Why it is written this way (it is the whole point of guest mode: people sign in when it is worth it):
 *  - It appears at the moment of INTENT (they just tapped Join / Record / Chat), never as a wall.
 *  - Every prompt names the exact thing they wanted and what they GET in return - benefit, not "please log in".
 *  - Only true, specific claims: real member counts when we have them, never invented numbers.
 *  - One obvious action (Continue with Google), a calm "Not now", and a reassurance line that removes the
 *    two usual fears (a password to remember, being posted about).
 *  - After signing in they land back on the same screen (lib/returnTo), so nothing is lost.
 */

export type SignInReason =
  | 'generic'
  | 'join_community'
  | 'create_community'
  | 'record_match'
  | 'create_session'
  | 'apply_session'
  | 'post'
  | 'like_comment'
  | 'ping'
  | 'report'
  | 'chat'
  | 'activity'
  | 'profile'
  | 'streak';

export type SignInContext = {
  /** Name of the thing they are looking at, e.g. the community. */
  name?: string;
  /** Real member / participant count, when known. */
  count?: number;
};

export type SignInIcon =
  | 'users'
  | 'trophy'
  | 'calendar'
  | 'message'
  | 'activity'
  | 'user'
  | 'flame'
  | 'heart'
  | 'bell'
  | 'flag'
  | 'plus';

export type SignInCopy = {
  icon: SignInIcon;
  title: string;
  subtitle: string;
  perks: [string, string, string];
};

const clean = (s?: string) => (s ?? '').trim();

export function signInCopy(reason: SignInReason, ctx: SignInContext = {}): SignInCopy {
  const name = clean(ctx.name);
  const count = typeof ctx.count === 'number' && ctx.count > 1 ? Math.floor(ctx.count) : 0;

  switch (reason) {
    case 'join_community':
      return {
        icon: 'users',
        title: name ? `Join ${name}` : 'Join this community',
        subtitle: count
          ? `${count} players are already in. Sign in to join them and play.`
          : 'Sign in to join and start playing with the people in it.',
        perks: [
          'Chat with the whole community',
          'Record matches and climb the leaderboard',
          'Get a ping when games are on',
        ],
      };
    case 'create_community':
      return {
        icon: 'users',
        title: 'Start your own community',
        subtitle: 'Bring your club, campus or friends together in one place.',
        perks: ['Invite members and approve requests', 'Run a leaderboard and a feed', 'Ping everyone when it is game time'],
      };
    case 'record_match':
      return {
        icon: 'trophy',
        title: 'Record your win',
        subtitle: 'Results count toward your stats and your community leaderboard.',
        perks: ['Your opponent confirms the score', 'A win / loss record per community', 'Keeps your daily streak alive'],
      };
    case 'create_session':
      return {
        icon: 'calendar',
        title: 'Find someone to play',
        subtitle: 'Post a session and players nearby can ask to join.',
        perks: ['You approve who joins', 'Group chat with everyone who is in', 'Reminders so nobody forgets'],
      };
    case 'apply_session':
      return {
        icon: 'calendar',
        title: 'Ask to join this session',
        subtitle: 'The organiser gets your request, and you are notified the moment you are accepted.',
        perks: ['Instant notification when you are in', 'Group chat with the other players', 'Counts toward your streak'],
      };
    case 'post':
      return {
        icon: 'plus',
        title: name ? `Post in ${name}` : 'Share with the community',
        subtitle: 'Photos, match stories and updates for everyone in the community.',
        perks: ['Likes and comments from members', 'Show off your matches', 'Stay part of the conversation'],
      };
    case 'like_comment':
      return {
        icon: 'heart',
        title: 'Join the conversation',
        subtitle: 'Like and comment once you are signed in.',
        perks: ['Cheer on friends’ matches', 'Reply to comments', 'Get notified when someone replies'],
      };
    case 'ping':
      return {
        icon: 'bell',
        title: 'Ping the community',
        subtitle: 'Let everyone know you are free to play right now.',
        perks: ['One tap reaches every member', 'See who is around', 'Turn a quiet evening into a match'],
      };
    case 'report':
      return {
        icon: 'flag',
        title: 'Sign in to report',
        subtitle: 'Reports are tied to an account so our team can follow up and stop abuse.',
        perks: ['Your report stays private', 'Our team reviews every one', 'Helps keep games friendly'],
      };
    case 'chat':
      return {
        icon: 'message',
        title: 'Your chats live here',
        subtitle: 'Message your communities and the people you play with.',
        perks: ['Community and session group chats', 'Replies and quoted messages', 'A push when someone writes back'],
      };
    case 'activity':
      return {
        icon: 'activity',
        title: 'Never miss a request',
        subtitle: 'Join requests, invites and match confirmations all land here.',
        perks: ['Approve or decline in one tap', 'Invites from your communities', 'Match scores to confirm'],
      };
    case 'profile':
      return {
        icon: 'user',
        title: 'Make it yours',
        subtitle: 'Create your player profile in about ten seconds.',
        perks: ['Your name, photo and bio', 'Your stats across every community', 'Streaks and session history'],
      };
    case 'streak':
      return {
        icon: 'flame',
        title: 'Start a streak',
        subtitle: 'Play, join or host a session each day to keep the flame alive.',
        perks: ['A daily streak you can show off', 'A reminder before it breaks', 'Longest streak tracked for you'],
      };
    case 'generic':
    default:
      return {
        icon: 'users',
        title: 'Join the game',
        subtitle: 'One tap with Google and you are in.',
        perks: ['Join communities and chat', 'Record matches and track stats', 'Find people to play with'],
      };
  }
}

/** Shown under the button on every prompt. */
export const SIGN_IN_REASSURANCE = 'Takes about 10 seconds. No password to remember.';
export const SIGN_IN_PRIVACY = 'We only use your name and email to set up your account.';
