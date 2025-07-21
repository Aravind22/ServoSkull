# RemindABot

A professional, easy-to-use CLI reminder application with desktop notifications.

## Features

- Add, list, and manage reminders
- **One-time reminders**: Schedule notifications for specific dates and times
- **Recurring reminders**: Create daily, weekly, monthly, or yearly recurring notifications
- Persistent background notification service
- Simple, intuitive commands
- Minimal, professional interface
- Input validation for dates and times

## Installation

```
npm install -g .
```

## Usage

Run the CLI with:

```
remindabot [command]
```

### Commands

| Command          | Description                                |
| ---------------- | ------------------------------------------ |
| remindabot add   | Add a new reminder (one-time or recurring) |
| remindabot list  | View all reminders                         |
| remindabot start | Start background notification service      |
| remindabot stop  | Stop notification service                  |
| remindabot reset | Clear all data and reset the system        |

### Reminder Types

#### One-time Reminders

- Set a specific date and time for a single notification
- Perfect for one-off tasks and events

#### Recurring Reminders

- **Daily**: Repeats every day at the same time
- **Weekly**: Repeats on a specific day of the week (e.g., every Monday)
- **Monthly**: Repeats on a specific day of the month (e.g., 15th of every month)
- **Yearly**: Repeats on the same date every year

### Input Validation

- Date format: YYYY-MM-DD (e.g., 2025-07-21)
- Time format: HH:MM in 24-hour format (e.g., 14:30)
- Invalid inputs are automatically corrected or rejected with helpful error messages

## Example

```bash
# Add a one-time reminder
remindabot add
# Follow the prompts to set date and time

# Add a recurring daily reminder
remindabot add
# Select "Recurring reminder" → "Daily" → Set start date and time

# Add a weekly reminder (every Monday)
remindabot add
# Select "Recurring reminder" → "Weekly" → Choose "Monday" → Set start date and time

# List all reminders
remindabot list

# Start the notification service
remindabot start

# Stop the notification service
remindabot stop

# Reset all data
remindabot reset
```

## License

ISC
