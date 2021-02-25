/*global window, braintree, XMLHttpRequest, console */
(function (win, braintree) {
    'use strict';
    function CreditCard() { }

    CreditCard.prototype.setBillingAddress = function (billingAddress) {
        if (billingAddress instanceof BillingAddress) {
            return this.billingAddress = billingAddress;
        }

        throw new Error('Invalid billing address');
    };

    CreditCard.prototype.isValid = function () {
        return this.billingAddress instanceof BillingAddress;
    };

    function BillingAddress() { }

    function ThreeDSecurePayment(payload, callback) {
        this.payment(payload, callback);
    }

    ThreeDSecurePayment.prototype = {
        // { token, amount, creditCard }
        payment: function (payload, callback) {
            ThreeDSecurePayment.validatePayload(payload);
            var requestParams = {
                authorization: payload.token // Use the generated client token to instantiate the Braintree client.
            };

            braintree.client.create(
                requestParams,
                function (clientError, clientInstance) {
                    if (clientError) {
                        if ('function' === typeof callback) {
                            clientError.step = 'payment';
                            clientError.payload = payload;
                            clientError.requestParams = requestParams;
                            callback(clientError)
                        }
                        return;
                    }

                    this.requestPayment.bind(this)(clientInstance, { creditCard: payload.creditCard, amount: payload.amount }, callback);
                }.bind(this)
            );
        },
        requestPayment(braintreeClient, payload, callback) {
            var creditCard = Object.assign(payload.creditCard);
            creditCard.setBillingAddress(ThreeDSecurePayment.buildBillingAddress('', '', '', payload.creditCard.billingAddress.streetAddress));

            var requestParams = {
                endpoint: 'payment_methods/credit_cards',
                method: 'post',
                data: {
                    creditCard: creditCard
                }
            };

            braintreeClient.request(
                requestParams,
                function (requestError, paymentResponse) {
                    if (requestError) {
                        if ('function' === typeof callback) {
                            requestError.step = 'requestPayment';
                            requestError.payload = payload;
                            requestError.requestParams = requestParams;
                            callback(requestError)
                        }
                        return;
                    }

                    this.createTDSPayment.bind(this)(
                        braintreeClient,
                        paymentResponse,
                        {
                            amount: payload.amount,
                            billingAddress: payload.creditCard.billingAddress
                        },
                        callback
                    );
                }.bind(this)
            );
        },
        createTDSPayment: function (braintreeClient, paymentResponse, payload, callback) {
            var requestParams = {
                client: braintreeClient,
                version: 2
            };

            braintree.threeDSecure.create(
                requestParams,
                function (threeDSecureError, threeDSecureInstance) {
                    if (threeDSecureError) {
                        if ('function' === typeof callback) {
                            threeDSecureError.step = 'createTDSPayment';
                            threeDSecureError.payload = payload;
                            threeDSecureError.requestParams = requestParams;
                            callback(threeDSecureError)
                        }
                        return;
                    }

                    this.verifyTDSCard.bind(this)(
                        threeDSecureInstance,
                        paymentResponse,
                        {
                            amount: payload.amount,
                            billingAddress: payload.billingAddress
                        },
                        callback
                    );
                }.bind(this)
            );
        },
        verifyTDSCard: function (threeDSecureInstance, paymentResponse, payload, callback) {
            var lookupData = null;
            var requestParams = {
                amount: payload.amount,
                nonce: paymentResponse.creditCards[0].nonce,
                bin: paymentResponse.creditCards[0].bin,
                billingAddress: payload.billingAddress,
                onLookupComplete: function (data, next) {
                    lookupData = data;
                    next();
                }
            };

            threeDSecureInstance.verifyCard(
                requestParams,
                function (verifyCardError, response) {
                    if (verifyCardError) {
                        if ('function' === typeof callback) {
                            verifyCardError.step = 'verifyTDSCard';
                            verifyCardError.payload = null;
                            verifyCardError.requestParams = requestParams;
                            callback(verifyCardError)
                        }

                        return;
                    }

                    if (!response.liabilityShifted) {
                        var errorMessage = '3D Secure authentication failed: ';
                        errorMessage += 'liabilityShifted = ' + response.liabilityShifted.toString() + '; ';
                        errorMessage += 'threeDSecureInfo: ' + JSON.stringify(response.threeDSecureInfo) + '; ';

                        callback(new Error(errorMessage));

                        return;
                    }

                    callback(null, response, lookupData)
                }
            );
        }
    };

    ThreeDSecurePayment.buildCreditCard = function (number, expirationMonth, expirationYear, cvv, billingAddress) {
        var card = new CreditCard();
        card.number = number;
        card.expirationMonth = expirationMonth;
        card.expirationYear = expirationYear;
        card.cvv = cvv;
        card.setBillingAddress(billingAddress);

        return card;
    };

    /**
     * @param {string} name
     * @param {string} surname
     * @param {string} phoneNumber
     * @param {string} streetAddress
     * @param {string} city
     * @param {string} region
     * @param {string} postalCode
     * @param {string} countryIso2
     *
     * @returns {BillingAddress}
     */
    ThreeDSecurePayment.buildBillingAddress = function (name = '', surname = '', phoneNumber = '', streetAddress = '', city = '', region = '', postalCode = '', countryIso2 = '') {
        var address = new BillingAddress();
        if (name) address.givenName = name;
        if (surname) address.surname = surname;
        if (phoneNumber) address.phoneNumber = String(phoneNumber).replace(/[^0-9]/g, '');
        if (streetAddress) address.streetAddress = streetAddress;
        if (city) address.locality = city;
        if (region) address.region = region.toUpperCase();
        if (postalCode) address.postalCode = postalCode;
        if (countryIso2) address.countryCodeAlpha2 = countryIso2.toUpperCase();

        return address;
    };

    ThreeDSecurePayment.validatePayload = function (payload) {
        if (!payload) {
            throw new Error('Payload is required');
        }

        if (!payload.token) {
            throw new Error('Token [token] is required');
        }

        if (!payload.creditCard) {
            throw new Error('Credit Card [creditCard] is required');
        }

        if (!payload.amount) {
            throw new Error('Amount [amount] is required');
        }

        if (!payload.creditCard.isValid()) {
            throw new Error('Credit card' + JSON.stringify(payload.creditCard) + ' invalid');
        }
    };

    win.ThreeDSecurePayment = ThreeDSecurePayment;

})(window || this, braintree);
