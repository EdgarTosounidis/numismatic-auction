import wixData from 'wix-data';

function updateTimer() {
    wixData.query("CategoryNames1")
        .find()
        .then((results) => {
            const auctionDateStr = results.items[0].time; // Assuming 'time' is the field storing the auction date

            // Parse the auction date string into a Date object
            const auctionDate = new Date(auctionDateStr);

            // Compare the current date with the auction date
            const currentDate = new Date();
            const now = new Date();
            const timeDiff = auctionDate.getTime() - now.getTime();

            if (timeDiff > 0) {
                // Calculate days, hours, minutes, and seconds from the time difference
                const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

                // Update the timer display on your page (replace 'timerDisplay' with the actual ID of your timer element)
                $w('#countdownTimer').text = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            } else {
                // Auction has already started, hide the countdown timer
                $w('#countdownTimer').hide();
            }
        });
}

// Call updateCountdownTimer initially to set up the countdown
updateTimer();

// Call updateCountdownTimer every second to keep updating the countdown
setInterval(updateTimer, 1000);