import { telegramIdFromUserRef, telegramUserRef } from './user-ref';

it('preserves a Telegram ID without numeric coercion', () => {
    expect(telegramUserRef('9007199254740993')).toBe(
        'telegram:9007199254740993',
    );
    expect(telegramIdFromUserRef('telegram:9007199254740993')).toBe(
        '9007199254740993',
    );
});

it.each(['web:42', 'telegram:4<script>', 'telegram:', '42'])(
    'does not decode %s as a Telegram ID',
    (ref) => expect(telegramIdFromUserRef(ref)).toBeNull(),
);
