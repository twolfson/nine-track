# nine-track changelog
3.0.1 - Fixed out of order placeholder requests issue

3.0.0 - Repaired regression for parallel requests being made inside of `startSeries`. Fixes #8

2.0.0 - Fixed `scrubFn` providing inconsistent responses when sending fresh data vs stored data. Fixes #4

1.4.0 - Added `preventRecording`. Fixes uber/eight-track#36

1.3.3 - Fixed up URLs in documentation

1.3.2 - Added more examples. Fixes #2

1.3.1 - Fixed lint errors

1.3.0 - Added `startSeries`/`stopSeries` for handling series data

1.2.0 - Added `scrubFn` to allow for sanitizing data before saving to disk

1.1.0 - Fixed Travis CI and moved to `twolfson-style` for lint/style

1.0.0 - Initial fork from `eight-track@2.1.0`
