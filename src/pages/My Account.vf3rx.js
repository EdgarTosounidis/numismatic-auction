import wixData from 'wix-data';

$w.onReady(function () {
    // Code to run when the page loads
    loadUserAddress();
});

function loadUserAddress() {
    // Assuming you have a database collection named "Users" and a field named "address"
    wixData.query("Users")
        .eq("userId", wixUsers.currentUser.id) // Assuming you're using Wix Membership
        .find()
        .then(results => {
            if (results.items.length > 0) {
                // Assuming you have an element on your page with an ID of "userAddress"
                $w("#userAddress").text = results.items[0].address;
            } else {
                // Handle case where user's address is not found
            }
        })
        .catch(error => {
            console.error("Error loading user address: " + error);
        });
}